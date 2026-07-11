chrome.devtools.panels.create("API Cartographer", "", "panel.html", (panel) => {
  panel.onShown.addListener((panelWindow) => {
    panelWindow.postMessage({ source: "api-cartographer", type: "panel-visible" }, "*");
  });
});