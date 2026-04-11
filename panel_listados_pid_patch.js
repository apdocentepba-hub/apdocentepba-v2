(function () {
  'use strict';

  function removePidCard() {
    const card = document.getElementById('panel-listados-pid-card');
    if (card) card.remove();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      removePidCard();
      setTimeout(removePidCard, 300);
      setTimeout(removePidCard, 1200);
    }, { once: true });
  } else {
    removePidCard();
    setTimeout(removePidCard, 300);
    setTimeout(removePidCard, 1200);
  }

  const observer = new MutationObserver(function () {
    removePidCard();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
