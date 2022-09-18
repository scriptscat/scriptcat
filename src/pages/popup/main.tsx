chrome.tabs.query(
  {
    active: true,
  },
  (tab) => {
    console.log(tab);
    try {
      chrome.webNavigation.getAllFrames(
        {
          tabId: tab[0].id!,
        },
        (frames) => {
          console.log(frames);
        }
      );
    } catch (e) {
      console.log(e);
    }
  }
);
