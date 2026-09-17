(function () {
  'use strict';
  const routes = ['hu', 'settlement', 'discard'];
  const huRoot = document.querySelector('[data-page="hu"]');
  const settlementRoot = document.querySelector('[data-page="settlement"]');
  let activeRoute = null;

  function normalizeRoute(hash) {
    const route = hash.replace(/^#/, '');
    return routes.includes(route) ? route : 'hu';
  }

  function renderRoute() {
    const route = normalizeRoute(location.hash);
    if (location.hash !== `#${route}`) history.replaceState(null, '', `#${route}`);
    if (activeRoute === 'hu' && route !== 'hu') HuPage.unmount();
    if (activeRoute === 'settlement' && route !== 'settlement') SettlementPage.unmount();
    document.querySelectorAll('[data-page]').forEach((page) => { page.hidden = page.dataset.page !== route; });
    document.querySelectorAll('[data-route]').forEach((button) => {
      if (button.dataset.route === route) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (route === 'hu' && activeRoute !== 'hu') HuPage.mount(huRoot);
    if (route === 'settlement' && activeRoute !== 'settlement') SettlementPage.mount(settlementRoot);
    activeRoute = route;
  }

  document.querySelectorAll('[data-route]').forEach((button) => {
    button.addEventListener('click', () => { location.hash = button.dataset.route; });
  });
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
})();
