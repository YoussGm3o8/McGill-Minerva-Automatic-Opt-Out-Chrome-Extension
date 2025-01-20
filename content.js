console.log('Content script loaded');

function getCurrentPage() {
  console.log('Checking current page, URL:', window.location.href);
  
  // First check for the main page table with specific criteria
  const table = document.querySelector('table.datadisplaytable');
  if (table) {
    // Only consider it the main page if the table has opt-out links
    const hasOptOutLinks = Array.from(table.querySelectorAll('a')).some(link => 
      link.textContent.trim().toLowerCase().includes('opt')
    );
    if (hasOptOutLinks) {
      console.log('Current page is main (opt-out table found)');
      return 'main';
    }
  }
  
  // Then check URL patterns for other pages
  if (window.location.href.includes('bztkopto.pm_agree_opt_out')) {
    console.log('Current page is confirm (based on URL)');
    return 'confirm';
  } else if (window.location.href.includes('bztkopto.pm_confirm_opt_out')) {
    console.log('Current page is final (based on URL)');
    return 'final';
  } else if (window.location.href.includes('bztkopto.pm_opt_out_processing')) {
    console.log('Current page is complete (based on URL)');
    return 'complete';
  }
  
  console.log('Current page is unknown');
  return 'unknown';
}

function extractFeeList() {
  console.log('Extracting fee list');
  const feeTable = document.querySelector('table.datadisplaytable');
  const fees = [];
  
  if (feeTable) {
    const rows = Array.from(feeTable.querySelectorAll('tr')).slice(1);
    
    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 4) {
        const feeName = cells[0].textContent.trim();
        let optOutLink = null;
        cells.forEach(cell => {
          const link = cell.querySelector('a');
          if (link && link.textContent.trim().toLowerCase().includes('opt')) {
            optOutLink = link;
          }
        });
        
        if (optOutLink && feeName) {
          fees.push({
            name: feeName,
            rowIndex: rowIndex + 1
          });
        }
      }
    });
  }
  
  console.log('Fees extracted:', fees);
  return fees;
}

function waitForElement(selector, timeout = 1000) {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

async function handleOptOutStep() {
  const currentPage = getCurrentPage();
  console.log('handleOptOutStep - Current page:', currentPage);
  
  return new Promise(async (resolve) => {
    switch (currentPage) {
      case 'confirm':
        console.log('Looking for opt-out button...');
        const forms = document.querySelectorAll('form');
        console.log('Found forms:', forms.length);
        
        for (const form of forms) {
          const inputs = form.querySelectorAll('input[type="submit"]');
          for (const input of inputs) {
            if (input.value === 'Opt-out') {
              console.log('Found Opt-out button, waiting before click...');
              await new Promise(resolve => setTimeout(resolve, 2000));
              try {
                input.click();
                console.log('Button clicked successfully');
                await new Promise(resolve => setTimeout(resolve, 2000));
                resolve(true);
                return;
              } catch (e) {
                console.error('Error clicking button:', e);
              }
            }
          }
        }
        resolve(false);
        break;
        
      case 'complete':
      case 'final':
        console.log('Looking for Go Back button...');
        const goBackButton = await waitForElement('input[value="Go Back"]');
        if (goBackButton) {
          console.log('Found Go Back button, waiting before click...');
          await new Promise(resolve => setTimeout(resolve, 100));
          try {
            goBackButton.click();
            console.log('Go Back button clicked successfully');
            // Wait for main page table to appear
            for (let i = 0; i < 15; i++) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              const mainTable = document.querySelector('table.datadisplaytable');
              const hasOptOutLinks = mainTable && Array.from(mainTable.querySelectorAll('a')).some(link => 
                link.textContent.trim().toLowerCase().includes('opt')
              );
              if (hasOptOutLinks) {
                console.log('Successfully returned to main page with opt-out links');
                resolve(true);
                return;
              }
              console.log('Waiting for main page table, attempt:', i + 1);
            }
          } catch (e) {
            console.error('Error clicking Go Back button:', e);
          }
        }
        resolve(false);
        break;
        
      default:
        resolve(false);
    }
  });
}

// Add a Set to track completed fees
const completedFees = new Set();

async function clickOptOutLinks(selectedFees) {
  console.log('Starting opt-out process for fees:', selectedFees);
  
  try {
    const currentFee = selectedFees[0];
    
    // Check if we've already processed this fee
    if (completedFees.has(currentFee.name)) {
      console.log(`Fee ${currentFee.name} was already processed, skipping`);
      return { success: true, inProgress: false, shouldContinue: true };
    }
    
    console.log(`Processing opt-out for: ${currentFee.name}`);
    
    // If link not found or process fails, indicate should continue to next fee
    if (!findAndClickOptOutLink(currentFee)) {
      console.log("Unable to process ${currentFee.name, should try next fee");
      return { success: false, inProgress: false, shouldContinue: true };
    }

    return { success: true, inProgress: false, shouldContinue: true };
  } catch (error) {
    console.error('Error in clickOptOutLinks:', error);
    return { success: false, inProgress: false, shouldContinue: true };
  }
}

function findAndClickOptOutLink(fee) {
  const feeTable = document.querySelector('table.datadisplaytable');
  if (!feeTable) {
    console.log('Fee table not found');
    return false;
  }

  const row = feeTable.querySelectorAll('tr')[fee.rowIndex];
  if (!row) {
    console.log(`Row not found for ${fee.name}`);
    return false;
  }

  const cells = row.querySelectorAll('td');
  for (const cell of cells) {
    const link = cell.querySelector('a');
    if (link && link.textContent.trim().toLowerCase().includes('opt')) {
      console.log(`Clicking opt-out link for: ${fee.name}`);
      link.click();
      return true;
    }
  }

  console.log(`No opt-out link found for ${fee.name}`);
  return false;
}

// Update message handler to properly handle async operations
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getFeeList") {
    const fees = extractFeeList();
    sendResponse({ fees: fees });
  } else if (message.action === "optOut") {
    (async () => {
      try {
        const result = await clickOptOutLinks(message.fees);
        sendResponse(result);
      } catch (error) {
        console.error('Opt-out process failed:', error);
        sendResponse({ success: false, inProgress: false, shouldContinue: true });
      }
    })();
    return true;
  }
  return true;
});
  
// ...existing code...

// Remove the existing MutationObserver and replace with this new version
const observer = new MutationObserver((mutations, obs) => {
  const currentPage = getCurrentPage();
  console.log('Mutation observed on page:', currentPage);
  
  // Only handle button clicks on confirmation or final pages
  if (currentPage === 'confirm' || currentPage === 'complete' || currentPage === 'final') {
    handleOptOutStep();
  } else {
    console.log('No action needed for page:', currentPage);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Update the initial page load handler to also check page type
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Waiting for page to stabilize');
    setTimeout(async () => {
      const currentPage = getCurrentPage();
      console.log('Initial page check:', currentPage);
      if (currentPage === 'confirm' || currentPage === 'complete' || currentPage === 'final') {
        await waitForElement('form');
        handleOptOutStep();
      }
    }, 2000);
  });
} else {
  console.log('Document already loaded - Waiting for page to stabilize');
  setTimeout(async () => {
    const currentPage = getCurrentPage();
    console.log('Initial page check:', currentPage);
    if (currentPage === 'confirm' || currentPage === 'complete' || currentPage === 'final') {
      await waitForElement('form');
      handleOptOutStep();
    }
  }, 1000);
}

// Replace deprecated unload event listener
window.addEventListener('beforeunload', () => {
  console.log('Before unload event');
  observer.disconnect();
});

// Ensure content script is running on page load
console.log('Content script loaded - Document readyState:', document.readyState);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded - Waiting for page to stabilize');
    setTimeout(async () => {
      console.log('Page should be stable now - Checking state');
      const currentPage = getCurrentPage();
      if (currentPage !== 'main') {
        await waitForElement('form'); // Wait for forms to be available
        handleOptOutStep();
      }
    }, 2000);
  });
} else {
  console.log('Document already loaded - Waiting for page to stabilize');
  setTimeout(async () => {
    console.log('Page should be stable now - Checking state');
    const currentPage = getCurrentPage();
    if (currentPage !== 'main') {
      await waitForElement('form'); // Wait for forms to be available
      handleOptOutStep();
    }
  }, 1000);
}