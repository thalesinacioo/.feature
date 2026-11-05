// Clique no ícone da extensão abre o side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Aba azul na página pede para abrir o painel (open precisa rodar direto no gesto do usuário)
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'bfm-open' && sender.tab) chrome.sidePanel.open({ windowId: sender.tab.windowId });
});
