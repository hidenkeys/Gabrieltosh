const search = document.querySelector("#search");
search?.addEventListener("input", () => {
  const words = search.value.trim().toLowerCase().split(/\s+/);
  let found = 0;
  document.querySelectorAll(".menu-section").forEach((section, i) => {
    let visible = 0;
    section.querySelectorAll("[data-item]").forEach((item) => {
      item.hidden = !words.every((word) => item.dataset.search.includes(word));
      if (!item.hidden) visible++;
    });
    section.hidden = !visible;
    const tab = document.querySelector(`nav a[href="#section-${i}"]`);
    tab.hidden = !visible;
    found += visible;
  });
  document.querySelector("#no-results").hidden = found !== 0;
});
