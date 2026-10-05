'use strict';

(() => {
  const installButton = document.createElement('button');
  installButton.className = 'btn primary web-install';
  installButton.type = 'button';
  installButton.textContent = 'Installa app';
  installButton.hidden = true;
  document.querySelector('.top').appendChild(installButton);

  const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installPrompt = null;

  function notify(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 5000);
  }

  if (isAppleMobile) {
    installButton.hidden = false;
    installButton.textContent = 'Come installare';
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener('click', async () => {
    if (isAppleMobile) {
      notify('In Safari: Condividi, poi “Aggiungi alla schermata Home”.');
      return;
    }
    if (!installPrompt) {
      notify('Apri il menu del browser e scegli “Installa Finanze” o “Aggiungi alla schermata Home”.');
      return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installButton.hidden = true;
  });

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((error) => {
        console.error('Registrazione offline non riuscita:', error);
      });
    });
  }
})();
