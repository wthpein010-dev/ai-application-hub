const page = document.querySelector("[data-hub-video-page]");

if (page) {
  const video = document.querySelector("#introVideo");
  const loadCard = document.querySelector("#loadCard");
  const loadButton = document.querySelector("#loadVideo");
  const message = document.querySelector("[data-hub-video-message]");

  function setOverlay(messageHtml, buttonHtml) {
    if (message) message.innerHTML = messageHtml;
    if (loadButton) loadButton.innerHTML = buttonHtml;
    if (loadCard) loadCard.hidden = false;
  }

  function revealVideo() {
    if (!video?.dataset.src) {
      setOverlay(
        "&#35270;&#39057;&#22320;&#22336;&#32570;&#22833;&#65292;&#35831;&#36820;&#22238;&#39318;&#39029;&#26816;&#26597;&#12290;",
        "&#26080;&#27861;&#21152;&#36733;",
      );
      return false;
    }

    if (!video.getAttribute("src")) {
      video.src = video.dataset.src;
      video.load();
    }

    if (loadCard) loadCard.hidden = true;
    video.hidden = false;
    return true;
  }

  async function playVideo(startAt) {
    if (!revealVideo()) return;

    if (Number.isFinite(startAt)) {
      if (video.readyState >= 1) {
        video.currentTime = startAt;
      } else {
        await new Promise((resolve) => {
          video.addEventListener("loadedmetadata", resolve, { once: true });
          video.addEventListener("error", resolve, { once: true });
        });
        if (video.readyState >= 1) video.currentTime = startAt;
      }
    }

    try {
      await video.play();
    } catch {
      // Browser policy can block playback, but native controls remain available.
    }
  }

  loadButton?.addEventListener("click", () => {
    playVideo();
  });

  document.querySelectorAll("[data-time]").forEach((chapter) => {
    chapter.addEventListener("click", () => {
      playVideo(Number(chapter.dataset.time));
    });
  });

  video?.addEventListener("error", () => {
    video.hidden = true;
    video.removeAttribute("src");
    video.load();
    setOverlay(
      "&#35270;&#39057;&#21152;&#36733;&#22833;&#36133;&#65292;&#35831;&#26816;&#26597;&#32593;&#32476;&#21518;&#37325;&#35797;&#12290;",
      "&#37325;&#35797;&#21152;&#36733;&#35270;&#39057;",
    );
  });
}
