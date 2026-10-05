'use strict';

(() => {
  const side = document.querySelector('.side');
  const nav = document.querySelector('#nav');
  const heading = document.querySelector('#title');
  const menuButton = document.createElement('button');
  menuButton.className = 'btn mobile-menu-toggle';
  menuButton.type = 'button';
  menuButton.setAttribute('aria-label', 'Apri il menu');
  menuButton.setAttribute('aria-controls', 'nav');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.innerHTML = '<span aria-hidden="true">☰</span  const quickAddButton = document.createElement('button');
  quickAddButton.className = 'btn primary web-quickadd';
  quickAddButton.type = 'button';
  quickAddButton.setAttribute('aria-label', 'Aggiungi un movimento');
  quickAddButton.textContent = '＋ Aggiungi movimento';
  document.body.appendChild(quickAddButton);
  quickAddButton.addEventListener('click', () => {
    const action = side.querySelector('[data-action="quickadd"]');
    if (!action) throw new Error('Pulsante per l’inserimento rapido non trovato.');
    action.click();
  });

>';
  document.querySelector('.top').appendChild(menuButton);

  const menuBackdrop = document.createElement('button');
  menuBackdrop.className = 'mobile-menu-backdrop';
  menuBackdrop.type = 'button';
  menuBackdrop.setAttribute('aria-label', 'Chiudi il menu');
  document.body.appendChild(menuBackdrop);

  function setMenuOpen(open) {
    document.body.classList.toggle('mobile-menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
    side.setAttribute('aria-hidden', String(!open && window.matchMedia('(max-width: 860px)').matches));
    side.inert = !open && window.matchMedia('(max-width: 860px)').matches;
    menuBackdrop.hidden = !open;
    if (open) {
      const active = nav.querySelector('button.on') || nav.querySelector('button[data-view]');
      if (active) active.focus();
    } else {
      menuButton.focus();
    }
  }

  menuButton.addEventListener('click', () => {
    setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
  });
  menuBackdrop.addEventListener('click', () => setMenuOpen(false));
  document.addEventListener('click', (event) => {
    if (event.target.closest('.side [data-view]') && window.matchMedia('(max-width: 860px)').matches) {
      setMenuOpen(false);
      heading.focus();
    }
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('mobile-menu-open')) setMenuOpen(false);
  });
  window.addEventListener('resize', () => {
    const mobile = window.matchMedia('(max-width: 860px)').matches;
    if (!mobile) {
      document.body.classList.remove('mobile-menu-open');
      menuBackdrop.hidden = true;
      side.removeAttribute('aria-hidden');
      side.inert = false;
      menuButton.setAttribute('aria-expanded', 'false');
    } else if (!document.body.classList.contains('mobile-menu-open')) {
      side.setAttribute('aria-hidden', 'true');
      side.inert = true;
    }
  });
  setMenuOpen(false);

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
      navigator.serviceWorker.register('./service-worker.js?v=1.4.5').catch((error) => {
        console.error('Registrazione offline non riuscita:', error);
      });
    });
  }
})();
