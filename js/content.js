let tooltip = null;
let noteTooltip = null; // Tooltip hiển thị note khi hover
let highlights = new Map();
let isApplyingHighlights = false; // Flag để tránh vòng lặp vô hạn với MutationObserver
let colorNames = {};

function loadColorNames() {
  chrome.storage.local.get(['colorNames'], (result) => {
    colorNames = result.colorNames || {};
  });
}

// Update colorNames if changed elsewhere
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.colorNames) {
    colorNames = changes.colorNames.newValue || {};
  }
});

loadColorNames();



// Convert hex color to rgba
function hexToRgba(hex, alpha = 0.3) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Tự động generate và inject CSS styles từ danh sách màu
function generateHighlightStyles() {
  let styleSheet = document.getElementById('pagenotes-dynamic-styles');
  
  if (!styleSheet) {
    styleSheet = document.createElement('style');
    styleSheet.id = 'pagenotes-dynamic-styles';
    document.head.appendChild(styleSheet);
  }
  
  let css = '';
  HIGHLIGHT_COLORS.forEach(color => {
    css += `
.pagenotes-highlight-${color.name} {
  background-color: ${hexToRgba(color.hex, 0.3)};
  border-bottom-color: ${color.hex};
}`;
  });
  
  styleSheet.textContent = css;
}

function getXPath(element) {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }

  if (element === document.body) {
    return '/html/body';
  }

  let position = 0;
  let siblings = element.parentNode.childNodes;

  for (let i = 0; i < siblings.length; i++) {
    let sibling = siblings[i];
    if (sibling === element) {
      return getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (position + 1) + ']';
    }
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
      position++;
    }
  }
}

function getElementByXPath(xpath) {
  return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

function getContainerOffset(container, range) {
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(container);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  return preCaretRange.toString().length;
}

function createRangeFromOffset(container, start, end) {
  const range = document.createRange();
  let currentStart = 0;
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
  let node;

  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    
    if (!startNode && currentStart + len >= start) {
      startNode = node;
      startOffset = start - currentStart;
    }
    
    if (!endNode && currentStart + len >= end) {
      endNode = node;
      endOffset = end - currentStart;
      break;
    }
    
    currentStart += len;
  }

  if (startNode && endNode) {
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }
  return null;
}

// Safe function to highlight a range by wrapping text nodes individually
function safeHighlightRange(range, color, id) {
  const startContainer = range.startContainer;
  const startOffset = range.startOffset;
  const endContainer = range.endContainer;
  const endOffset = range.endOffset;

  // If simple selection (same text node), just wrap
  if (startContainer === endContainer && startContainer.nodeType === 3) {
    const span = document.createElement('span');
    span.className = `pagenotes-highlight pagenotes-highlight-${color}`;
    span.dataset.highlightId = id;
    try {
      range.surroundContents(span);
      return [span];
    } catch (e) {
      console.warn('Simple surround failed', e);
    }
  }

  // Complex selection: Find all text nodes
  const textNodes = [];
  const walker = document.createTreeWalker(
    range.commonAncestorContainer, 
    NodeFilter.SHOW_TEXT, 
    {
      acceptNode: (node) => {
        if (range.intersectsNode(node)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_REJECT;
      }
    }
  );

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  const createdSpans = [];

  textNodes.forEach(node => {
    const rangeForNode = document.createRange();
    
    // Determine start/end for this specific node
    const isStartNode = node === startContainer;
    const isEndNode = node === endContainer;
    
    const start = isStartNode ? startOffset : 0;
    const end = isEndNode ? endOffset : node.textContent.length;

    // Skip empty ranges
    if (start === end) return;

    rangeForNode.setStart(node, start);
    rangeForNode.setEnd(node, end);

    const span = document.createElement('span');
    span.className = `pagenotes-highlight pagenotes-highlight-${color}`;
    span.dataset.highlightId = id;

    try {
      rangeForNode.surroundContents(span);
      createdSpans.push(span);
    } catch (e) {
      console.error('Failed to wrap node', node, e);
    }
  });

  return createdSpans;
}

function showTooltip(x, y) {
  removeTooltip();

  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  tooltip = document.createElement('div');
  tooltip.className = 'pagenotes-tooltip';
  tooltip.style.position = 'absolute';
  
  // Calculate position
  const tooltipHeight = 50; // Approximate height
  const margin = 10;
  
  // Default to top
  let top = rect.top + window.scrollY - tooltipHeight - margin;
  let left = rect.left + window.scrollX + (rect.width / 2);

  // Check if top is cut off (relative to viewport)
  if (rect.top - tooltipHeight - margin < 0) {
    // Position below
    top = rect.bottom + window.scrollY + margin;
    tooltip.style.transformOrigin = 'top center'; // Update animation origin
  }

  tooltip.style.top = top + 'px';
  tooltip.style.left = left + 'px';
  // Center horizontally
  tooltip.style.transform = 'translateX(-50%)';

  HIGHLIGHT_COLORS.forEach(color => {
    const button = document.createElement('button');
    button.className = `pagenotes-tooltip-button pagenotes-tooltip-${color.name}`;
    button.style.backgroundColor = color.hex;
    const label = colorNames[color.name] || (color.name.charAt(0).toUpperCase() + color.name.slice(1));
    button.title = label; // Use custom color label when available
    button.onclick = () => createHighlight(color.name);
    tooltip.appendChild(button);
  });

  document.body.appendChild(tooltip);
}

function removeTooltip() {
  if (tooltip) {
    tooltip.remove();
    tooltip = null;
  }
}

function createHighlight(color) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const selectedText = selection.toString().trim();

  if (!selectedText) return;

  let container = range.commonAncestorContainer;
  if (container.nodeType === 3) {
    container = container.parentNode;
  }

  const xpath = getXPath(container);
  const startOffset = getContainerOffset(container, range);
  const endOffset = startOffset + selectedText.length;
  const id = Date.now().toString();

  const highlightData = {
    id: id,
    url: window.location.href,
    pageTitle: document.title,
    textContent: selectedText,
    note: '',
    color: color,
    xpath: xpath,
    textOffsetStart: startOffset,
    textOffsetEnd: endOffset,
    timestamp: Date.now()
  };

  // Use safe highlight function
  const spans = safeHighlightRange(range, color, id);
  
  if (spans.length > 0) {
    highlights.set(id, highlightData);
    
    // Attach events to all created spans
    spans.forEach(span => attachHighlightEvents(span, highlightData));

    chrome.runtime.sendMessage({
      type: 'HIGHLIGHT_CREATED',
      data: highlightData
    });
  }

  selection.removeAllRanges();
  removeTooltip();
}

function showNoteTooltip(element, highlightData) {
  removeNoteTooltip();
  
  // Chỉ hiển thị nếu có note
  if (!highlightData.note) return;
  
  const rect = element.getBoundingClientRect();
  
  // Lấy màu highlight
  const colorObj = HIGHLIGHT_COLORS.find(c => c.name === highlightData.color);
  const bgColor = colorObj ? colorObj.hex : '#3b82f6';
  
  noteTooltip = document.createElement('div');
  noteTooltip.className = 'pagenotes-note-tooltip';
  noteTooltip.textContent = highlightData.note;
  noteTooltip.style.setProperty('--tooltip-color', bgColor);
  
  document.body.appendChild(noteTooltip);
  
  // Tính toán vị trí sau khi đã append để có kích thước thực
  const tooltipRect = noteTooltip.getBoundingClientRect();
  const margin = 8;
  
  // Mặc định hiển thị phía trên
  let top = rect.top + window.scrollY - tooltipRect.height - margin;
  let left = rect.left + window.scrollX + (rect.width / 2) - (tooltipRect.width / 2);
  
  // Nếu bị cắt phía trên, hiển thị phía dưới
  if (rect.top - tooltipRect.height - margin < 0) {
    top = rect.bottom + window.scrollY + margin;
    noteTooltip.classList.add('pagenotes-note-tooltip-bottom');
  }
  
  // Đảm bảo không bị tràn ra ngoài viewport
  if (left < 10) left = 10;
  if (left + tooltipRect.width > window.innerWidth - 10) {
    left = window.innerWidth - tooltipRect.width - 10;
  }
  
  noteTooltip.style.top = top + 'px';
  noteTooltip.style.left = left + 'px';
}

function removeNoteTooltip() {
  if (noteTooltip) {
    noteTooltip.remove();
    noteTooltip = null;
  }
}

function attachHighlightEvents(element, highlightData) {
  // Chỉ attach nếu chưa có event listener
  if (element.dataset.hasEvents === 'true') return;
  
  element.addEventListener('click', (e) => {
    e.stopPropagation();
    openNoteDialog(highlightData);
  });
  
  // Hover events để hiển thị note
  element.addEventListener('mouseenter', () => {
    // Lấy data mới nhất từ Map
    const currentData = highlights.get(highlightData.id) || highlightData;
    showNoteTooltip(element, currentData);
  });
  
  element.addEventListener('mouseleave', () => {
    removeNoteTooltip();
  });
  
  element.dataset.hasEvents = 'true';
}

function openNoteDialog(highlightData) {
  const note = prompt('Add your note:', highlightData.note || '');
  if (note !== null) {
    highlightData.note = note;
    highlights.set(highlightData.id, highlightData);

    chrome.runtime.sendMessage({
      type: 'HIGHLIGHT_CREATED',
      data: highlightData
    });
  }
}

// Debounce function to limit restoration calls
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Observe DOM changes for SPAs (Telegram, Facebook, etc.)
const observer = new MutationObserver(debounce((mutations) => {
  // Bỏ qua nếu đang apply highlights để tránh vòng lặp vô hạn
  if (isApplyingHighlights) return;
  
  // Kiểm tra xem mutation có phải do extension tạo ra không
  const isExtensionMutation = mutations.some(mutation => {
    return Array.from(mutation.addedNodes).some(node => 
      node.nodeType === 1 && 
      (node.classList?.contains('pagenotes-highlight') || 
       node.querySelector?.('.pagenotes-highlight'))
    );
  });
  
  // Bỏ qua nếu mutation do extension tạo ra
  if (isExtensionMutation) return;
  
  // Only reload if we have saved highlights for this URL
  chrome.storage.local.get(['highlights'], (result) => {
    const savedHighlights = result.highlights || [];
    const currentUrl = window.location.href;
    const hasHighlightsForPage = savedHighlights.some(h => h.url === currentUrl);
    
    if (hasHighlightsForPage) {
      // console.log('PageNotes: DOM changed, re-applying highlights...');
      loadHighlights();
    }
  });
}, 1000)); // Wait 1s after changes stop to avoid performance hit

observer.observe(document.body, {
  childList: true,
  subtree: true
});

function loadHighlights() {
  // Tránh load lại nếu đang load
  if (isApplyingHighlights) return;
  
  isApplyingHighlights = true;
  console.log('PageNotes: Loading highlights...');
  
  chrome.storage.local.get(['highlights'], (result) => {
    const savedHighlights = result.highlights || [];
    const currentUrl = window.location.href;

    savedHighlights.forEach(highlight => {
      if (highlight.url === currentUrl) {
        try {
          // Kiểm tra xem highlight đã tồn tại trong DOM chưa
          const existingElements = document.querySelectorAll(`[data-highlight-id="${highlight.id}"]`);
          if (existingElements.length > 0) {
            // Highlight đã tồn tại, chỉ cần đảm bảo events được attach (nếu chưa có)
            if (!highlights.has(highlight.id)) {
              highlights.set(highlight.id, highlight);
              existingElements.forEach(el => {
                // Chỉ attach nếu chưa có event listener (kiểm tra bằng data attribute)
                if (!el.dataset.hasEvents) {
                  attachHighlightEvents(el, highlight);
                  el.dataset.hasEvents = 'true';
                }
              });
            }
            return;
          }

          // Kiểm tra xem highlight đã được load vào Map chưa
          if (highlights.has(highlight.id)) {
            return;
          }

          const container = getElementByXPath(highlight.xpath);
          if (container) {
            const range = createRangeFromOffset(
              container, 
              highlight.textOffsetStart, 
              highlight.textOffsetEnd
            );

            if (range) {
              const spans = safeHighlightRange(range, highlight.color, highlight.id);
              if (spans.length > 0) {
                highlights.set(highlight.id, highlight);
                spans.forEach(span => {
                  attachHighlightEvents(span, highlight);
                  span.dataset.hasEvents = 'true';
                });
              }
            }
          }
        } catch (e) {
          console.error('PageNotes: Error restoring highlight:', e);
        }
      }
    });
    
    isApplyingHighlights = false;
  });
}

document.addEventListener('mouseup', (e) => {
  setTimeout(() => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText.length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showTooltip(rect.left + window.scrollX, rect.top + window.scrollY);
    } else {
      removeTooltip();
    }
  }, 10);
});

document.addEventListener('mousedown', (e) => {
  if (tooltip && !tooltip.contains(e.target)) {
    removeTooltip();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCROLL_TO_HIGHLIGHT') {
    const highlightElements = document.querySelectorAll(`[data-highlight-id="${message.highlightId}"]`);
    if (highlightElements.length > 0) {
      highlightElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      highlightElements.forEach(el => {
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 2000);
      });
    }
  }

  if (message.type === 'HIGHLIGHT_DELETED') {
    // Xóa highlight khỏi DOM
    const highlightElements = document.querySelectorAll(`[data-highlight-id="${message.highlightId}"]`);
    highlightElements.forEach(el => {
      try {
        // Unwrap span để restore text gốc
        const parent = el.parentNode;
        if (parent) {
          // Di chuyển tất cả child nodes ra ngoài span
          while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
          }
          // Remove span rỗng
          parent.removeChild(el);
          // Normalize text nodes để merge các text nodes liền kề
          if (parent.nodeType === Node.ELEMENT_NODE) {
            parent.normalize();
          }
        }
      } catch (e) {
        console.warn('Failed to remove highlight element:', e);
        // Fallback: chỉ cần remove span nếu unwrap fail
        try {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        } catch (e2) {
          // Ignore
        }
      }
    });
    
    // Xóa khỏi Map
    highlights.delete(message.highlightId);
  }
});

// Generate CSS styles từ danh sách màu khi load
generateHighlightStyles();

loadHighlights();
