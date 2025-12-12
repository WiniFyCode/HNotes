chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Object để theo dõi các tác vụ cần làm khi tab tải xong
const tasksForTabs = {};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Kiểm tra xem tab đã tải xong và có tác vụ đang chờ không
  if (changeInfo.status === 'complete' && tasksForTabs[tabId]) {
    const task = tasksForTabs[tabId];
    
    if (task.type === 'SCROLL_TO_HIGHLIGHT') {
      chrome.tabs.sendMessage(tabId, {
        type: 'SCROLL_TO_HIGHLIGHT',
        highlightId: task.highlightId
      }).catch(err => console.log("Could not send scroll message, content script may not be active.", err));
    }
    
    // Xóa tác vụ sau khi hoàn thành để tránh chạy lại
    delete tasksForTabs[tabId];
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'HIGHLIGHT_CREATED') {
    // Save to both Supabase and local storage for reliability
    // The content.js already saves to Supabase, so we mainly ensure local storage backup
    chrome.storage.local.get(['highlights'], (result) => {
      const highlights = result.highlights || [];
      const existingIndex = highlights.findIndex(h => h.id === message.data.id);
      
      if (existingIndex !== -1) {
        // Update highlight đã tồn tại
        highlights[existingIndex] = message.data;
      } else {
        // Thêm highlight mới
        highlights.push(message.data);
      }
      
      chrome.storage.local.set({ highlights }, () => {
        // Broadcast update message to sidebar
        chrome.runtime.sendMessage({ type: 'HIGHLIGHTS_UPDATED' }).catch(() => {
          // Ignore if sidebar is not open
        });
      });
    });
    return true; // Giữ channel mở cho async operation
  }

  // Đây là message được gửi từ content script (khi click highlight trên trang)
  // hoặc từ sidebar (khi click highlight trên cùng 1 trang)
  if (message.type === 'SCROLL_TO_HIGHLIGHT') {
    // Nếu message có tabId thì gửi thẳng, không thì query tab active
    const targetTabId = message.tabId || sender.tab?.id;
    if (targetTabId) {
      chrome.tabs.sendMessage(targetTabId, {
        type: 'SCROLL_TO_HIGHLIGHT',
        highlightId: message.highlightId
      }).catch(err => console.log("Failed to send scroll message directly.", err));
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: 'SCROLL_TO_HIGHLIGHT',
            highlightId: message.highlightId
          }).catch(err => console.log("Failed to send scroll message to active tab.", err));
        }
      });
    }
    return true;
  }
  
  // Message này được gửi từ sidebar khi người dùng click vào highlight của 1 trang khác
  if (message.type === 'OPEN_AND_SCROLL') {
    chrome.tabs.create({ url: message.url }, (tab) => {
      // Đăng ký tác vụ cuộn đến highlight cho tab mới này
      tasksForTabs[tab.id] = {
        type: 'SCROLL_TO_HIGHLIGHT',
        highlightId: message.highlightId
      };
    });
    return true;
  }

  if (message.type === 'HIGHLIGHT_DELETED') {
    // Broadcast message đến tất cả tabs có URL khớp
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.url === message.url) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'HIGHLIGHT_DELETED',
            highlightId: message.highlightId
          }).catch(() => {
            // Ignore errors nếu content script chưa load
          });
        }
      });
    });
    return true;
  }
});
