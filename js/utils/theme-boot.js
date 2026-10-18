(function () {
  try {
    var t = localStorage.getItem('simplechat.theme');
    if (t === 'light' || t === 'dark' || t === 'system') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) { /* storage unavailable: default system */ }
})();
