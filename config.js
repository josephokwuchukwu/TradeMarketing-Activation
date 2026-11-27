// Trade Activate settings for this copy of the app.
// apiUrl: where the shared server is. Leave empty to keep data on each device only.
//   - On Vercel the app and its server share one address, so it uses the page's own address.
//   - On GitHub Pages there is no server, so it stays on-device (an admin can still set an address
//     for one device from Data & Power BI > Cloud sync & servers).
// servers: optional direct addresses of server 1, 2 and 3, used by the status card when there is no load balancer.
window.TA_CONFIG = {
  apiUrl: (location.protocol === "https:" && !/github\.io$/.test(location.hostname)) ? location.origin : "",
  servers: []
};
