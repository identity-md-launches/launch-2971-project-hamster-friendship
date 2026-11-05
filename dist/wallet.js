/* Connection and explicit Supabase Web3 login. No transactions or approvals.
   Uses EIP-6963 discovery and the EIP-1193 provider already inside the wallet. */
(function () {
  'use strict';
  var dialog = /** @type {HTMLDialogElement} */ (document.getElementById('wallet-dialog'));
  var button = document.getElementById('btn-wallet');
  var options = document.getElementById('wallet-options');
  var status = document.getElementById('wallet-status');
  var providers = [], selected = null, address = '', chain = '', busy = false;
  var remembered = '';
  var lastConnected = '';
  try { remembered = localStorage.getItem('hamster-wallet-provider') || ''; } catch (_) { /* optional */ }
  var allowed = ['eth_accounts', 'eth_requestAccounts', 'eth_chainId', 'wallet_switchEthereumChain'];
  function request(provider, method, params = undefined) {
    if (allowed.indexOf(method) === -1) return Promise.reject(new Error('This game only connects wallets.'));
    return provider.request(Object.assign({ method: method }, params ? { params: params } : {}));
  }
  function short(value) { return value.slice(0, 6) + '…' + value.slice(-4); }
  function renderControl() {
    void window.HamsterSave.setWallet(address && chain === '0x1' ? address : '');
    var connected = address && chain === '0x1' ? address.toLowerCase() : '';
    if (connected && connected !== lastConnected) window.dispatchEvent(new Event('hamster:wallet-connected'));
    lastConnected = connected;
    button.textContent = address ? chain === '0x1' ? short(address) : 'Switch to Mainnet' : 'Connect MetaMask';
    button.setAttribute('aria-label', address ? chain === '0x1' ? 'Wallet ' + short(address) + '. Open connection details' : 'Switch to Mainnet · Ethereum Mainnet' : 'Connect MetaMask');
  }
  function accountsChanged(accounts) {
    address = Array.isArray(accounts) && /^0x[0-9a-fA-F]{40}$/.test(accounts[0] || '') ? accounts[0] : '';
    renderControl();
    if (dialog.open) renderOptions();
  }
  function chainChanged(value) {
    chain = String(value).toLowerCase(); renderControl();
    status.textContent = address && chain !== '0x1' ? 'This wallet is on another network. Switch to Ethereum Mainnet to finish connecting.' : '';
    if (dialog.open) renderOptions();
  }
  function detach() {
    if (selected && selected.provider.removeListener) {
      selected.provider.removeListener('accountsChanged', accountsChanged);
      selected.provider.removeListener('chainChanged', chainChanged);
      selected.provider.removeListener('disconnect', disconnected);
    }
  }
  function disconnected() {
    detach(); selected = null; address = ''; chain = ''; remembered = '';
    try { localStorage.removeItem('hamster-wallet-provider'); } catch (_) { /* optional */ }
    renderControl(); if (dialog.open) renderOptions();
  }
  function choose(entry) {
    if (selected !== entry) detach();
    selected = entry;
    if (entry.provider.removeListener) detach();
    if (entry.provider.on) {
      entry.provider.on('accountsChanged', accountsChanged);
      entry.provider.on('chainChanged', chainChanged);
      entry.provider.on('disconnect', disconnected);
    }
  }
  async function connect(entry) {
    if (busy) return;
    busy = true; status.textContent = 'Open ' + entry.name + ' to connect.'; renderOptions();
    try {
      choose(entry);
      var accounts = await request(entry.provider, 'eth_requestAccounts');
      accountsChanged(accounts);
      if (!address) throw new Error('No account was shared. Open your wallet and try again.');
      chain = String(await request(entry.provider, 'eth_chainId')).toLowerCase();
      if (chain !== '0x1') {
        await request(entry.provider, 'wallet_switchEthereumChain', [{ chainId: '0x1' }]);
        chain = String(await request(entry.provider, 'eth_chainId')).toLowerCase();
      }
      if (chain !== '0x1') throw new Error('Switch your wallet to Ethereum Mainnet, then try again.');
      remembered = entry.id;
      try { localStorage.setItem('hamster-wallet-provider', remembered); } catch (_) { /* optional */ }
      status.textContent = window.HamsterSave.snapshot().configured ? 'Connected. Sign in below to save your progress.' : window.HamsterSave.snapshot().status;
      renderControl();
    } catch (error) {
      status.textContent = error.code === 4001 ? 'The wallet request was declined. Try again or continue as a guest.' : error.code === -32002 ? 'A request is already open in your wallet. Complete it there, then retry.' : 'Unable to connect. ' + (error.message || 'Open your wallet and retry.');
      renderControl();
    } finally { busy = false; renderOptions(); }
  }
  function row(label, action, icon = undefined) {
    var item = document.createElement('button'); item.type = 'button'; item.className = 'btn btn-secondary wallet-row';
    if (icon && /^(data:image\/|https:\/\/)/.test(icon)) {
      var img = document.createElement('img'); img.src = icon; img.alt = ''; img.width = 28; img.height = 28; item.append(img);
    }
    var text = document.createElement('span'); text.textContent = label; item.append(text);
    item.disabled = busy; item.addEventListener('click', action); options.append(item);
  }
  function renderOptions() {
    options.replaceChildren();
    if (address && selected) {
      var full = document.createElement('p'); full.className = 'wallet-address'; full.textContent = address; options.append(full);
      var network = document.createElement('p'); network.className = 'panel-note'; network.textContent = chain === '0x1' ? 'Connected · Ethereum Mainnet (1)' : 'Wrong network · Ethereum Mainnet required'; options.append(network);
      if (chain !== '0x1') row('Switch to Ethereum Mainnet', function () { void connect(selected); });
      var saveState = window.HamsterSave.snapshot();
      if (chain === '0x1' && !saveState.cloud && !saveState.configured) {
        var unavailable = document.createElement('p'); unavailable.className = 'error'; unavailable.textContent = saveState.status; options.append(unavailable);
      } else if (chain === '0x1' && !saveState.cloud) {
        var keepLegacy = null;
        if (saveState.legacyAvailable) {
          var label = document.createElement('label'); label.className = 'mute-label'; keepLegacy = document.createElement('input'); keepLegacy.type = 'checkbox'; keepLegacy.checked = true;
          label.append(keepLegacy, document.createTextNode('Keep this browser’s existing cloud balance and progress')); options.append(label);
        }
        row(busy ? 'Signing in…' : 'Sign in to save', async function () {
          if (busy) return; busy = true; status.textContent = 'Confirm the login message in your wallet. This costs no gas.';
          var keep = Boolean(keepLegacy && keepLegacy.checked); renderOptions();
          try { await window.HamsterSave.signIn(selected.provider, address, keep); status.textContent = 'Signed in. Restart the map for saved progress.'; }
          catch (error) { status.textContent = error.code === 4001 ? 'Login declined. Continue as a guest or retry.' : error.message; }
          finally { busy = false; renderOptions(); }
        });
      } else if (saveState.cloud) { var saved = document.createElement('p'); saved.className = 'panel-note'; saved.textContent = 'Verified wallet profile · cloud saves enabled.'; options.append(saved); }
      row('Disconnect', disconnected);
      return;
    }
    providers.slice().sort(function (a, b) { return Number(b.id === 'io.metamask') - Number(a.id === 'io.metamask'); }).forEach(function (entry) {
      row(busy && selected === entry ? 'Connecting to ' + entry.name + '…' : 'Connect ' + entry.name, function () { void connect(entry); }, entry.icon);
    });
    if (!providers.length) {
      var note = document.createElement('p'); note.className = 'panel-note';
      note.textContent = 'Open this page in MetaMask’s browser on your phone, or install its browser extension on desktop.'; options.append(note);
      var link = document.createElement('a'); link.className = 'btn btn-secondary wallet-row';
      link.href = 'https://link.metamask.io/dapp/' + location.href.replace(/^https?:\/\//, ''); link.textContent = 'Open in MetaMask'; options.append(link);
      var install = document.createElement('a'); install.className = 'wallet-row'; install.href = 'https://metamask.io/download/'; install.target = '_blank'; install.rel = 'noopener noreferrer'; install.textContent = 'Get MetaMask'; options.append(install);
    }
  }
  function add(entry) {
    if (!entry.provider || typeof entry.provider.request !== 'function' || providers.some(function (p) { return p.provider === entry.provider || p.id === entry.id; })) return;
    providers.push(entry); if (dialog.open) renderOptions();
    if (remembered === entry.id && !selected) {
      choose(entry);
      Promise.all([request(entry.provider, 'eth_accounts'), request(entry.provider, 'eth_chainId')]).then(function (data) {
        accountsChanged(data[0]); chainChanged(data[1]);
      }).catch(function () { disconnected(); });
    }
  }
  window.addEventListener('eip6963:announceProvider', function (event) {
    var detail = /** @type {CustomEvent} */ (event).detail;
    if (detail && detail.info && typeof detail.info.rdns === 'string') add({ id: detail.info.rdns, name: String(detail.info.name || 'Browser wallet'), icon: detail.info.icon, provider: detail.provider });
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  // Older MetaMask and its mobile browser may not announce EIP-6963 yet.
  function legacyProvider() {
    if (!window.ethereum || providers.length) return;
    var legacy = (window.ethereum.providers || [window.ethereum]).find(function (p) { return p.isMetaMask; }) || window.ethereum;
    add({ id: legacy.isMetaMask ? 'io.metamask' : 'legacy', name: legacy.isMetaMask ? 'MetaMask' : 'Browser wallet', provider: legacy });
  }
  legacyProvider();
  window.addEventListener('ethereum#initialized', legacyProvider, { once: true });
  button.addEventListener('click', function () {
    (/** @type {HTMLDialogElement} */ (document.getElementById('menu-dialog'))).close(); window.__hamster.pause(); renderOptions(); status.textContent = ''; dialog.showModal();
  });
  document.getElementById('close-wallet').addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) dialog.close(); });
  dialog.addEventListener('close', function () { button.focus({ preventScroll: true }); });
  window.HamsterWallet = { snapshot: function () { return { address: address, chainId: chain, connected: Boolean(address && chain === '0x1'), pending: busy }; } };
})();
