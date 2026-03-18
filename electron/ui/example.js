document.addEventListener('DOMContentLoaded', async () => {
  const subscriptionDisposers = [];
  const addSubscriptionDisposer = (disposer) => {
    if (typeof disposer === 'function') {
      subscriptionDisposers.push(disposer);
    }
  };
  const disposeSubscriptions = () => {
    while (subscriptionDisposers.length > 0) {
      const disposer = subscriptionDisposers.pop();
      try {
        disposer();
      } catch (error) {
        console.error('Failed to dispose examples subscription:', error);
      }
    }
  };

  setupExampleImageModal();

  try {
    const theme = await window.electron.getTheme();
    applyTheme(theme);
  } catch (err) {
    console.error('Failed to load theme for examples page:', err);
  }

  addSubscriptionDisposer(window.electron.onThemeChanged((theme) => {
    applyTheme(theme);
  }));

  window.addEventListener('beforeunload', () => {
    disposeSubscriptions();
  });
});

function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
}

function setupExampleImageModal() {
  const modal = document.getElementById('exampleImageModal');
  const modalImage = document.getElementById('exampleImageModalImg');
  const modalTitle = document.getElementById('exampleImageModalTitle');
  const modalInstructions = document.getElementById('exampleImageModalInstructions');
  const closeBtn = document.getElementById('closeExampleImageModal');
  const exampleImages = Array.from(document.querySelectorAll('.example-card img'));

  if (!modal || !modalImage || !modalTitle || !modalInstructions) {
    return;
  }

  const closeModal = () => {
    modal.hidden = true;
    modalImage.src = '';
    modalImage.alt = '';
    modalTitle.textContent = 'Example Detail';
    modalInstructions.textContent = '';
  };

  exampleImages.forEach((img) => {
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');

    const openModal = () => {
      const card = img.closest('.example-card');
      const title = card?.querySelector('h3')?.textContent?.trim() || 'Example Detail';
      const instructions = card?.querySelector('p')?.textContent?.trim() || '';

      modalTitle.textContent = title;
      modalInstructions.textContent = instructions;
      modalImage.src = img.src;
      modalImage.alt = img.alt || title;
      modal.hidden = false;
    };

    img.addEventListener('click', openModal);
    img.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openModal();
      }
    });
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
  }

  modal.addEventListener('click', (event) => {
    if (event.target?.dataset?.action === 'close-example-modal') {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeModal();
    }
  });
}
