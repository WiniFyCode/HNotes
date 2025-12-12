let allHighlights = [];
let filteredHighlights = [];
let activeFilter = null; // { type: 'website'|'date'|'color'|'tag', value: '...' }
let colorNames = {};

// Tự động generate CSS variables từ danh sách màu
function generateColorVariables() {
  let styleSheet = document.getElementById('pagenotes-color-variables');
  
  if (!styleSheet) {
    styleSheet = document.createElement('style');
    styleSheet.id = 'pagenotes-color-variables';
    document.head.appendChild(styleSheet);
  }
  
  let css = ':root {\n';
  HIGHLIGHT_COLORS.forEach(color => {
    css += `  --color-${color.name}: ${color.hex};\n`;
  });
  css += '}\n\n';
  
  // Generate class cho category-item-color-dot
  HIGHLIGHT_COLORS.forEach(color => {
    css += `.category-item-color-dot.color-${color.name} { background-color: var(--color-${color.name}); }\n`;
  });
  
  // Generate class cho highlight-card
  HIGHLIGHT_COLORS.forEach(color => {
    css += `.highlight-card.color-${color.name}::before { background: var(--color-${color.name}); margin: 5px; border-radius: 1px;}\n`;
  });
  
  styleSheet.textContent = css;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function loadColorNames() {
  chrome.storage.local.get(['colorNames'], (result) => {
    colorNames = result.colorNames || {};
    renderColorNamesSettings();
  });
}

function renderColorNamesSettings() {
  const container = document.getElementById('colorNamesList');
  if (!container) return;

  container.innerHTML = HIGHLIGHT_COLORS.map(c => {
    const val = colorNames[c.name] || capitalize(c.name);
    return `
      <div class="color-name-row" data-color="${c.name}">
        <span class="color-swatch" style="background: ${c.hex}; width:18px;height:18px;border-radius:4px;display:inline-block;margin-right:8px;vertical-align:middle;"></span>
        <input class="color-name-input" data-color="${c.name}" value="${escapeHtml(val)}" />
      </div>
    `;
  }).join('');

  // Auto-save on input change
  const inputs = container.querySelectorAll('.color-name-input');
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.color;
      const v = (input.value || '').trim();
      colorNames[key] = v || capitalize(key);
      chrome.storage.local.set({ colorNames });
    });
  });
}

function loadHighlights() {
  chrome.storage.local.get(['highlights'], (result) => {
    allHighlights = result.highlights || [];
    applyFiltersAndSort();
    renderHighlights();
  });
}

function applyFiltersAndSort() {
  filteredHighlights = [...allHighlights];

  // Apply Active Filter (Drill-down)
  if (activeFilter) {
    if (activeFilter.type === 'website') {
      filteredHighlights = filteredHighlights.filter(h => h.url === activeFilter.value);
    } else if (activeFilter.type === 'date') {
      filteredHighlights = filteredHighlights.filter(h => formatDateKey(h.timestamp) === activeFilter.value);
    } else if (activeFilter.type === 'color') {
      filteredHighlights = filteredHighlights.filter(h => h.color === activeFilter.value);
    } else if (activeFilter.type === 'tag') {
      filteredHighlights = filteredHighlights.filter(h => h.tags && h.tags.includes(activeFilter.value));
    }
  }

  const searchInput = document.getElementById('searchInput');
  const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
  if (searchTerm) {
    filteredHighlights = filteredHighlights.filter(h =>
      (h.textContent || '').toLowerCase().includes(searchTerm) ||
      (h.note || '').toLowerCase().includes(searchTerm) ||
      (h.pageTitle || '').toLowerCase().includes(searchTerm)
    );
  }

  // Default sort by recent
  filteredHighlights.sort((a, b) => b.timestamp - a.timestamp);
  
  updateFilterUI();
}

function updateFilterUI() {
  const container = document.getElementById('activeFilterContainer');
  
  if (activeFilter) {
    container.classList.remove('hidden');
    let displayText = activeFilter.value;
    let filterClass = '';
    
    // Use custom color name if filter is for a color
    if (activeFilter.type === 'color') {
      displayText = colorNames[activeFilter.value] || capitalize(activeFilter.value);
      filterClass = `color-${activeFilter.value}`;
    }
    
    container.innerHTML = `
      <div class="filter-chip ${filterClass}">
        <span class="filter-chip-text">${escapeHtml(displayText)}</span>
        <div class="filter-chip-remove" id="removeFilterBtn">
          <span class="material-symbols-outlined">close</span>
        </div>
      </div>
    `;
    
    document.getElementById('removeFilterBtn').addEventListener('click', () => {
      activeFilter = null;
      applyFiltersAndSort();
      renderHighlights();
    });
  } else {
    container.classList.add('hidden');
    container.innerHTML = '';
  }
}

// Search By Button Handlers
document.querySelectorAll('.search-by-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.type;
    showCategoryView(type);
  });
});

document.getElementById('backToMainBtn').addEventListener('click', () => {
  const view = document.getElementById('categoryView');
  const type = categoryViewState.type;
  
  if (type === 'website' && categoryViewState.selectedDomain) {
    // Nếu đang ở detail view, quay lại group view
    categoryViewState.selectedDomain = null;
    showCategoryView('website');
  } else {
    // Quay lại main view
    view.classList.add('hidden');
    categoryViewState = { type: null, selectedDomain: null };
  }
});

// State để track category view navigation
let categoryViewState = { type: null, selectedDomain: null };

function showCategoryView(type, selectedDomain = null) {
  const view = document.getElementById('categoryView');
  const title = document.getElementById('categoryTitle');
  const list = document.getElementById('categoryList');
  
  view.classList.remove('hidden');
  categoryViewState.type = type;
  categoryViewState.selectedDomain = selectedDomain;
  
  if (type === 'website' && selectedDomain) {
    // Hiển thị chi tiết URLs của domain đã chọn
    showWebsiteDetailView(selectedDomain, title, list);
  } else if (type === 'website') {
    // Hiển thị danh sách domains
    showWebsiteGroupView(title, list);
  } else {
    // Các type khác (date, color, tag) giữ nguyên logic cũ
    title.textContent = `Select ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    showOtherCategoryView(type, title, list);
  }
}

function showWebsiteGroupView(title, list) {
  title.textContent = 'Select Website';
  
  // Group theo base URL (protocol + hostname)
  const domainGroups = {};
  
  allHighlights.forEach(h => {
    try {
      const url = new URL(h.url);
      const baseUrl = url.protocol + '//' + url.hostname;
      
      if (!domainGroups[baseUrl]) {
        domainGroups[baseUrl] = {
          urls: [],
          count: 0
        };
      }
      
      domainGroups[baseUrl].urls.push(h.url);
      domainGroups[baseUrl].count++;
    } catch (e) {
      // Nếu không parse được, dùng URL gốc
      const baseUrl = h.url;
      if (!domainGroups[baseUrl]) {
        domainGroups[baseUrl] = {
          urls: [],
          count: 0
        };
      }
      domainGroups[baseUrl].urls.push(h.url);
      domainGroups[baseUrl].count++;
    }
  });

  // Render domain groups
  list.innerHTML = Object.entries(domainGroups)
    .sort((a, b) => b[1].count - a[1].count) // Sort by count desc
    .map(([baseUrl, data]) => {
      let displayName = baseUrl;
      try {
        const url = new URL(baseUrl);
        displayName = url.hostname.replace('www.', '');
      } catch (e) {
        displayName = getDomain(baseUrl);
      }
      
      return `
      <div class="category-item" data-domain="${escapeHtml(baseUrl)}">
        <div class="category-item-left">
          <span class="material-symbols-outlined" style="font-size: 18px; color: var(--text-secondary);">language</span>
          <span class="category-item-name">${escapeHtml(displayName)}</span>
        </div>
        <span class="category-item-count">${data.count}</span>
        <span class="material-symbols-outlined" style="font-size: 18px; color: var(--text-secondary); margin-left: 8px;">chevron_right</span>
      </div>
    `}).join('');

  // Attach Click Handlers - Click vào domain để xem chi tiết
  list.querySelectorAll('.category-item').forEach(item => {
    item.addEventListener('click', () => {
      const domain = item.dataset.domain;
      showCategoryView('website', domain);
    });
  });
}

function showWebsiteDetailView(selectedDomain, title, list) {
  // Hiển thị title với domain
  try {
    const url = new URL(selectedDomain);
    title.textContent = url.hostname.replace('www.', '');
  } catch (e) {
    title.textContent = getDomain(selectedDomain);
  }
  
  // Lấy tất cả URLs thuộc domain này với pageTitle
  const urlData = {}; // { url: { count, pageTitle } }
  
  allHighlights.forEach(h => {
    try {
      const url = new URL(h.url);
      const baseUrl = url.protocol + '//' + url.hostname;
      
      if (baseUrl === selectedDomain) {
        if (!urlData[h.url]) {
          urlData[h.url] = {
            count: 0,
            pageTitle: h.pageTitle || ''
          };
        }
        urlData[h.url].count++;
        // Lấy pageTitle từ highlight đầu tiên hoặc mới nhất
        if (!urlData[h.url].pageTitle && h.pageTitle) {
          urlData[h.url].pageTitle = h.pageTitle;
        }
      }
    } catch (e) {
      // Nếu không parse được, so sánh trực tiếp
      if (h.url.startsWith(selectedDomain)) {
        if (!urlData[h.url]) {
          urlData[h.url] = {
            count: 0,
            pageTitle: h.pageTitle || ''
          };
        }
        urlData[h.url].count++;
        if (!urlData[h.url].pageTitle && h.pageTitle) {
          urlData[h.url].pageTitle = h.pageTitle;
        }
      }
    }
  });

  // Render URL list với pageTitle + URL
  list.innerHTML = Object.entries(urlData)
    .sort((a, b) => b[1].count - a[1].count) // Sort by count desc
    .map(([url, data]) => {
      let displayUrl = url;
      try {
        const urlObj = new URL(url);
        displayUrl = urlObj.pathname || '/';
        if (displayUrl.length > 40) {
          displayUrl = displayUrl.substring(0, 37) + '...';
        }
      } catch (e) {
        displayUrl = url;
      }
      
      const pageTitle = data.pageTitle || '';
      const displayText = pageTitle ? `${pageTitle} - ${displayUrl}` : displayUrl;
      
      return `
      <div class="category-item" data-value="${escapeHtml(url)}" title="${escapeHtml(url)}">
        <div class="category-item-left">
          <span class="material-symbols-outlined" style="font-size: 18px; color: var(--text-secondary);">link</span>
          <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
            ${pageTitle ? `<span class="category-item-name" style="font-weight: 500;">${escapeHtml(pageTitle)}</span>` : ''}
            <span class="category-item-name" style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(displayUrl)}</span>
          </div>
        </div>
        <span class="category-item-count">${data.count}</span>
      </div>
    `}).join('');

  // Attach Click Handlers - Click vào URL để apply filter
  list.querySelectorAll('.category-item').forEach(item => {
    item.addEventListener('click', () => {
      activeFilter = { type: 'website', value: item.dataset.value };
      applyFiltersAndSort();
      renderHighlights();
      document.getElementById('categoryView').classList.add('hidden');
    });
  });
}

function showOtherCategoryView(type, title, list) {
  // Aggregate Data cho các type khác (date, color, tag)
  const counts = {};
  
  allHighlights.forEach(h => {
    let key;
    if (type === 'date') {
      key = formatDateKey(h.timestamp);
    } else if (type === 'color') {
      key = h.color;
    } else if (type === 'tag') {
      const tags = h.tags || [];
      tags.forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
      return;
    }
    
    if (key) {
      counts[key] = (counts[key] || 0) + 1;
    }
  });

  // Render List
  list.innerHTML = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => {
      let iconHtml = '';
      let displayName = name;
      if (type === 'color') {
        iconHtml = `<span class="category-item-color-dot color-${name}"></span>`;
        displayName = colorNames[name] || capitalize(name);
      }
      
      return `
      <div class="category-item" data-value="${escapeHtml(name)}">
        <div class="category-item-left">
          ${iconHtml}
          <span class="category-item-name">${escapeHtml(displayName)}</span>
        </div>
        <span class="category-item-count">${count}</span>
      </div>
    `}).join('');

  // Attach Click Handlers
  list.querySelectorAll('.category-item').forEach(item => {
    item.addEventListener('click', () => {
      activeFilter = { type, value: item.dataset.value };
      applyFiltersAndSort();
      renderHighlights();
      document.getElementById('categoryView').classList.add('hidden');
    });
  });
}

function formatDateKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

document.getElementById('searchInput').addEventListener('input', () => {
  applyFiltersAndSort();
  renderHighlights();
});

function renderHighlights() {
  const container = document.getElementById('highlightsList');

  if (filteredHighlights.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✨</div>
        <p>No highlights found</p>
        <p class="empty-subtitle">Select text on any webpage to create your first highlight</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredHighlights.map(highlight => `
    <div class="highlight-card color-${highlight.color}" data-id="${highlight.id}">
      <div class="highlight-text">${escapeHtml(highlight.textContent)}</div>
      ${highlight.note ? `<div class="highlight-note">${escapeHtml(highlight.note)}</div>` : ''}
      
      ${highlight.tags && highlight.tags.length > 0 ? `
        <div class="highlight-tags">
          ${highlight.tags.map(tag => `<span class="tag-chip">#${escapeHtml(tag)}</span>`).join('')}
        </div>
      ` : ''}

      <div class="highlight-meta">
        <span class="highlight-url" title="${escapeHtml(highlight.pageTitle || highlight.url)}">${escapeHtml(highlight.pageTitle || getDomain(highlight.url))}</span>
        <span class="highlight-time">${formatTime(highlight.timestamp)}</span>
        <div class="highlight-actions">
          <button class="action-btn tag" title="Add Tag" data-action="tag">
            <span class="material-symbols-outlined">label</span>
          </button>
          <button class="action-btn edit" title="Edit Note" data-action="edit">
            <span class="material-symbols-outlined">edit</span>
          </button>
          <button class="action-btn copy" title="Copy Text" data-action="copy">
            <span class="material-symbols-outlined">content_copy</span>
          </button>
          <button class="action-btn delete" title="Delete" data-action="delete">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.highlight-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't trigger scroll if clicking an action button
      if (e.target.closest('.action-btn')) return;
      
      const highlightId = card.dataset.id;
      scrollToHighlight(highlightId);
    });

    // Action buttons handlers
    const id = card.dataset.id;
    const highlight = allHighlights.find(h => h.id === id);

    card.querySelector('.action-btn.tag').addEventListener('click', (e) => {
      e.stopPropagation();
      openTagModal(highlight);
    });

    card.querySelector('.action-btn.edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditNoteModal(highlight);
    });

    card.querySelector('.action-btn.copy').addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Tạo text để copy bao gồm cả highlight text và note
      let textToCopy = highlight.textContent;
      
      if (highlight.note && highlight.note.trim()) {
        textToCopy += '\n\nNote:\n' + highlight.note;
      }
      
      // Thêm URL nếu có
      if (highlight.url) {
        textToCopy += '\n\nSource: ' + highlight.url;
      }
      
      navigator.clipboard.writeText(textToCopy).then(() => {
        // Show toast feedback
        const btn = e.currentTarget;
        const originalIcon = btn.innerHTML;
        btn.innerHTML = '<span class="material-symbols-outlined">check</span>';
        setTimeout(() => btn.innerHTML = originalIcon, 1000);
      }).catch(err => {
        console.error('Failed to copy:', err);
      });
    });

    card.querySelector('.action-btn.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteConfirmModal(id);
    });
  });
}

// Tag Modal Logic
let currentEditingHighlight = null;
let selectedTags = new Set();

function openTagModal(highlight) {
  currentEditingHighlight = highlight;
  selectedTags = new Set(highlight.tags || []);
  
  const modal = document.getElementById('tagModal');
  const input = document.getElementById('tagInput');
  const list = document.getElementById('existingTagsList');
  
  input.value = '';
  modal.classList.remove('hidden');
  input.focus();

  renderModalTags();
}

function renderModalTags() {
  const list = document.getElementById('existingTagsList');
  
  // Collect all unique tags from all highlights
  const allTags = new Set();
  allHighlights.forEach(h => {
    if (h.tags) h.tags.forEach(t => allTags.add(t));
  });

  // Also include currently selected tags (even if unique to this highlight)
  selectedTags.forEach(t => allTags.add(t));

  if (allTags.size === 0) {
    list.innerHTML = '<span style="color: var(--text-secondary); font-size: 12px;">No existing tags. Type above to create one.</span>';
    return;
  }

  list.innerHTML = Array.from(allTags).sort().map(tag => `
    <div class="modal-tag-chip ${selectedTags.has(tag) ? 'selected' : ''}" data-tag="${escapeHtml(tag)}">
      #${escapeHtml(tag)}
    </div>
  `).join('');

  list.querySelectorAll('.modal-tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
      } else {
        selectedTags.add(tag);
      }
      renderModalTags();
    });
  });
}

// Modal close handlers
document.getElementById('closeTagModalBtn').addEventListener('click', () => {
  closeModal('tagModal');
});

document.getElementById('cancelTagBtn').addEventListener('click', () => {
  closeModal('tagModal');
});

document.getElementById('closeEditNoteModalBtn').addEventListener('click', () => {
  closeModal('editNoteModal');
});

document.getElementById('cancelEditNoteBtn').addEventListener('click', () => {
  closeModal('editNoteModal');
});

document.getElementById('closeDeleteModalBtn').addEventListener('click', () => {
  closeModal('deleteConfirmModal');
});

document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
  closeModal('deleteConfirmModal');
});

document.getElementById('closeAddPageNoteModalBtn').addEventListener('click', () => {
  closeModal('addPageNoteModal');
});

document.getElementById('cancelAddPageNoteBtn').addEventListener('click', () => {
  closeModal('addPageNoteModal');
});

// Close modal when clicking backdrop
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      overlay.classList.add('hidden');
    }
  });
});

// Close modal with ESC key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const openModal = document.querySelector('.modal-overlay:not(.hidden)');
    if (openModal) {
      openModal.classList.add('hidden');
    }
  }
});

// Helper function to close modal
function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

// Edit Note Modal
let currentEditingNoteHighlight = null;

function openEditNoteModal(highlight) {
  currentEditingNoteHighlight = highlight;
  const modal = document.getElementById('editNoteModal');
  const input = document.getElementById('editNoteInput');
  
  input.value = highlight.note || '';
  modal.classList.remove('hidden');
  
  // Focus và select text sau khi modal hiển thị
  setTimeout(() => {
    input.focus();
    input.select();
  }, 100);
}

document.getElementById('saveEditNoteBtn').addEventListener('click', () => {
  if (currentEditingNoteHighlight) {
    const newNote = document.getElementById('editNoteInput').value.trim();
    currentEditingNoteHighlight.note = newNote;
    saveHighlights();
    closeModal('editNoteModal');
    currentEditingNoteHighlight = null;
  }
});

// Delete Confirm Modal
let currentDeletingHighlightId = null;

function openDeleteConfirmModal(highlightId) {
  currentDeletingHighlightId = highlightId;
  const modal = document.getElementById('deleteConfirmModal');
  modal.classList.remove('hidden');
}

document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
  if (currentDeletingHighlightId) {
    const deletedHighlight = allHighlights.find(h => h.id === currentDeletingHighlightId);
    allHighlights = allHighlights.filter(h => h.id !== currentDeletingHighlightId);
    saveHighlights();
    
    // Thông báo cho content script để xóa highlight khỏi DOM
    chrome.runtime.sendMessage({
      type: 'HIGHLIGHT_DELETED',
      highlightId: currentDeletingHighlightId,
      url: deletedHighlight?.url
    });
    
    closeModal('deleteConfirmModal');
    currentDeletingHighlightId = null;
  }
});

// Add Page Note Modal
function openAddPageNoteModal() {
  const modal = document.getElementById('addPageNoteModal');
  const input = document.getElementById('addPageNoteInput');
  
  input.value = '';
  modal.classList.remove('hidden');
  
  setTimeout(() => {
    input.focus();
  }, 100);
}

document.getElementById('saveAddPageNoteBtn').addEventListener('click', () => {
  const note = document.getElementById('addPageNoteInput').value.trim();
  
  if (!note) {
    return;
  }
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const pageNote = {
        id: Date.now().toString(),
        url: tabs[0].url,
        pageTitle: tabs[0].title,
        textContent: '📝 Page Note',
        note: note,
        color: 'blue',
        xpath: '',
        textOffsetStart: 0,
        textOffsetEnd: 0,
        timestamp: Date.now()
      };

      allHighlights.push(pageNote);
      chrome.storage.local.set({ highlights: allHighlights }, () => {
        applyFiltersAndSort();
        renderHighlights();
        closeModal('addPageNoteModal');
      });
    }
  });
});

document.getElementById('saveTagsBtn').addEventListener('click', () => {
  if (currentEditingHighlight) {
    // Add any text currently in input as a tag
    const inputValue = document.getElementById('tagInput').value.trim();
    if (inputValue) {
      selectedTags.add(inputValue);
    }

    currentEditingHighlight.tags = Array.from(selectedTags);
    saveHighlights();
    closeModal('tagModal');
  }
});

document.getElementById('tagInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const val = e.target.value.trim();
    if (val) {
      selectedTags.add(val);
      e.target.value = '';
      renderModalTags();
    }
  }
});

function saveHighlights() {
  chrome.storage.local.set({ highlights: allHighlights }, () => {
    applyFiltersAndSort();
    renderHighlights();
    // Notify background/content scripts if needed
    chrome.runtime.sendMessage({ type: 'HIGHLIGHTS_UPDATED' });
  });
}

function scrollToHighlight(highlightId) {
  const highlight = allHighlights.find(h => h.id === highlightId);
  if (!highlight) return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      // If current tab is the same URL, just scroll
      if (tabs[0].url === highlight.url) {
        chrome.runtime.sendMessage({
          type: 'SCROLL_TO_HIGHLIGHT',
          highlightId: highlightId
        });
      } else {
        // Gửi yêu cầu cho background script để mở tab và cuộn đến
        chrome.runtime.sendMessage({
          type: 'OPEN_AND_SCROLL',
          url: highlight.url,
          highlightId: highlightId
        });
      }
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

document.querySelectorAll('.tab-button').forEach(button => {
  button.addEventListener('click', () => {
    const tabName = button.dataset.tab;

    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    button.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
  });
});

document.getElementById('analyzeBtn').addEventListener('click', () => {
  const resultDiv = document.getElementById('analysisResult');
  resultDiv.classList.add('visible');
  resultDiv.innerHTML = `
    <p><strong>AI Analysis Summary</strong></p>
    <p style="margin-top: 12px;">You have <strong>${allHighlights.length}</strong> highlights across <strong>${new Set(allHighlights.map(h => h.url)).size}</strong> pages.</p>
    <p style="margin-top: 8px;">Most used color: <strong>${getMostUsedColor()}</strong></p>
    <p style="margin-top: 8px;">Notes with content: <strong>${allHighlights.filter(h => h.note).length}</strong></p>
    <p style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 12px; color: #888;">💡 This is a demo analysis. Connect to an AI service for deeper insights.</p>
  `;
});

function getMostUsedColor() {
  const colorCounts = allHighlights.reduce((acc, h) => {
    acc[h.color] = (acc[h.color] || 0) + 1;
    return acc;
  }, {});

  let maxColor = 'yellow';
  let maxCount = 0;
  for (const [color, count] of Object.entries(colorCounts)) {
    if (count > maxCount) {
      maxCount = count;
      maxColor = color;
    }
  }
  return maxColor.charAt(0).toUpperCase() + maxColor.slice(1);
}

document.getElementById('sendChatBtn').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendChatMessage();
  }
});

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();

  if (!message) return;

  const chatMessages = document.getElementById('chatMessages');

  chatMessages.innerHTML += `
    <div class="chat-message user">${escapeHtml(message)}</div>
  `;

  input.value = '';

  setTimeout(() => {
    const aiResponse = generateAIResponse(message);
    chatMessages.innerHTML += `
      <div class="chat-message ai">${aiResponse}</div>
    `;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 800);
}

function generateAIResponse(question) {
  const lowerQuestion = question.toLowerCase();

  if (lowerQuestion.includes('how many')) {
    return `You have <strong>${allHighlights.length}</strong> highlights saved across <strong>${new Set(allHighlights.map(h => h.url)).size}</strong> different pages.`;
  }

  if (lowerQuestion.includes('recent') || lowerQuestion.includes('latest')) {
    if (allHighlights.length > 0) {
      // Tìm highlight có timestamp lớn nhất (mới nhất)
      const latest = allHighlights.reduce((prev, current) => 
        (prev.timestamp > current.timestamp) ? prev : current
      );
      return `Your most recent highlight is: "<em>${escapeHtml(latest.textContent.substring(0, 100))}${latest.textContent.length > 100 ? '...' : ''}</em>"`;
    }
    return "You don't have any highlights yet.";
  }

  if (lowerQuestion.includes('summarize') || lowerQuestion.includes('summary')) {
    return `You've highlighted content from ${new Set(allHighlights.map(h => h.url)).size} pages. Your highlights are distributed as: ${getColorDistribution()}. Keep building your knowledge base!`;
  }

  return `💡 This is a demo response. To get real AI-powered answers about your notes and highlights, you'll need to integrate with an AI service like OpenAI, Claude, or similar. Your question: "${escapeHtml(question)}"`;
}

function getColorDistribution() {
  const colors = allHighlights.reduce((acc, h) => {
    acc[h.color] = (acc[h.color] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(colors)
    .map(([color, count]) => `${count} ${color}`)
    .join(', ');
}

document.getElementById('addPageNoteBtn').addEventListener('click', () => {
  openAddPageNoteModal();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'HIGHLIGHTS_UPDATED') {
    loadHighlights();
  }
});

// Generate CSS variables từ danh sách màu khi load
loadColorNames();
generateColorVariables();

loadHighlights();
