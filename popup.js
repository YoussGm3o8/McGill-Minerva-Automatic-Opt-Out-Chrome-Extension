document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    console.log('Current URL:', currentTab.url);
    // Change URL check to match any McGill opt-out related page
    if (!currentTab.url.includes('horizon.mcgill.ca/pban1/bztkopto')) {
      showError('Please navigate to the McGill fee opt-out page to use this extension.');
      return;
    }

    chrome.tabs.sendMessage(currentTab.id, { action: "getFeeList" }, (response) => {
      if (chrome.runtime.lastError) {
        showError('Unable to connect to the page. Please refresh the page and try again.');
        return;
      }

      if (response && response.fees) {
        const feeListContainer = document.getElementById('fee-list-container');
        const fees = response.fees;
        
        if (fees.length === 0) {
          showError('No opt-out fees found on this page.');
          return;
        }
        
        // Add select all functionality
        const selectAll = document.getElementById('select-all');
        selectAll.addEventListener('click', () => {
          const checkboxes = feeListContainer.querySelectorAll('input[type="checkbox"]');
          checkboxes.forEach(checkbox => {
            checkbox.checked = selectAll.checked;
          });
        });
        
        fees.forEach((fee) => {
          const feeItem = document.createElement('div');
          feeItem.className = 'fee-item';
          
          const checkboxLabel = document.createElement('label');
          const checkboxInput = document.createElement('input');
          checkboxInput.type = 'checkbox';
          checkboxInput.className = 'fee-checkbox'; // Add a class for better selection
          checkboxInput.value = JSON.stringify(fee);
          
          // Update select-all state when individual checkboxes change
          checkboxInput.addEventListener('change', () => {
            const allCheckboxes = feeListContainer.querySelectorAll('input[type="checkbox"]:not(#select-all)');
            const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
            selectAll.checked = allChecked;
          });
          
          checkboxLabel.appendChild(checkboxInput);
          checkboxLabel.appendChild(document.createTextNode(fee.name));
          
          feeItem.appendChild(checkboxLabel);
          feeListContainer.appendChild(feeItem);
        });
      }
    });
  });

  document.getElementById('opt-out-form').addEventListener('submit', (event) => {
    event.preventDefault();
    
    const selectedFees = [];
    const checkboxes = document.querySelectorAll('.fee-checkbox:checked'); // Update selector
    
    if (checkboxes.length === 0) {
      showError('Please select at least one fee to opt out from.');
      return;
    }
    
    checkboxes.forEach((checkbox) => {
      selectedFees.push(JSON.parse(checkbox.value));
    });
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const updateProgress = (current, next) => {
        const progressInfo = document.getElementById('progress-info');
        const currentFeeElem = document.getElementById('current-fee');
        const nextFeeElem = document.getElementById('next-fee');
        const warningMessage = document.getElementById('warning-message');
        
        if (current) {
          warningMessage.style.display = 'block';
        } else {
          warningMessage.style.display = 'none';
        }
        
        progressInfo.style.display = 'block';
        currentFeeElem.textContent = current || '-';
        nextFeeElem.textContent = next || 'None';
      };

      const processNextFee = async () => {
        if (selectedFees.length > 0) {
          const currentFee = selectedFees[0];
          const nextFee = selectedFees[1];
          console.log('Processing:', currentFee.name, 'Next:', nextFee ? nextFee.name : 'None');
          updateProgress(currentFee.name, nextFee ? nextFee.name : 'None');
          
          try {
            const response = await new Promise((resolve, reject) => {
              chrome.tabs.sendMessage(tabs[0].id, { 
                action: "optOut", 
                fees: [currentFee],
                nextFee: nextFee ? nextFee.name : null,
                isLastFee: selectedFees.length === 1
              }, (response) => {
                if (chrome.runtime.lastError) {
                  resolve({ success: false, inProgress: true });
                } else {
                  resolve(response);
                }
              });
            });

            console.log('Response from opt-out:', response);

            if (response && response.success) {
              console.log('Successfully processed:', currentFee.name);
              selectedFees.shift();
              
              if (selectedFees.length > 0) {
                console.log('Moving to next fee in 15 seconds...');
                setTimeout(processNextFee, 5000);
              } else {
                // Only show completion after the last fee is fully processed
                setTimeout(() => {
                  updateProgress('All Complete!', '-');
                  document.getElementById('warning-message').style.display = 'none';
                  alert("All opt-out requests have been processed!");
                }, 5000);
              }
            } else if (response && response.inProgress) {
              // If still processing, check again after a delay
              console.log('Still processing, retrying in 5 seconds...');
              setTimeout(processNextFee, 5000);
            } else {
              console.log('Failed to process fee, retrying in 5 seconds...');
              setTimeout(processNextFee, 5000);
            }
          } catch (error) {
            console.error('Error during opt-out:', error);
            setTimeout(processNextFee, 5000);
          }
        }
      };
      
      processNextFee();
    });
  });
});

function showError(message) {
  const container = document.getElementById('fee-list-container');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  container.innerHTML = '';
  container.appendChild(errorDiv);
  
  const submitButton = document.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
  }
}