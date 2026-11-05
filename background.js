// Clique no ícone da extensão abre o side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Painéis abertos por janela: o side panel se conecta aqui ao abrir e desconecta ao fechar
const openPanels = new Map(); // windowId -> port

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'bfm-panel') return;
  let windowId = null;
  port.onMessage.addListener((msg) => {
    windowId = msg.windowId;
    openPanels.set(windowId, port);
  });
  port.onDisconnect.addListener(() => {
    if (openPanels.get(windowId) === port) openPanels.delete(windowId);
  });
});

// Aba azul na página: abre ou fecha o painel da janela.
// open precisa rodar direto no gesto do usuário, sem await antes.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type !== 'bfm-toggle' || !sender.tab) return;
  const windowId = sender.tab.windowId;
  const panel = openPanels.get(windowId);
  if (panel) panel.postMessage({ type: 'close' });
  else chrome.sidePanel.open({ windowId });
});
