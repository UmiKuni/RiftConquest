(function () {
  const rcGame = (window.rcGame = window.rcGame || {});

  const REGIONS = ["Noxus", "Demacia", "Ionia"];

  function getRegionOrder(s) {
    const order = s && Array.isArray(s.regionOrder) ? s.regionOrder : null;
    if (
      order &&
      order.length === REGIONS.length &&
      REGIONS.every((r) => order.includes(r))
    ) {
      return order;
    }
    return REGIONS;
  }

  rcGame.state = {
    REGIONS,
    getRegionOrder,
  };
})();
