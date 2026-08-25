const PROJECT_VISUALS = {
  hub: {
    src: "./assets/companion-preview.png",
    alt: "AI 伙伴与项目图鉴视觉",
    position: "center",
  },
  "minigame-project-simulator": {
    src: "./assets/game-preview.png",
    alt: "小游戏立项工具快速问卷界面",
    position: "center top",
  },
  "codex-quota-bar": {
    src: "./assets/atlas-avatar.png",
    alt: "Codex 桌面助手图标",
    position: "center",
    fit: "contain",
  },
};

const FORCE_COVERS = new Set(["codex-thread-workbench"]);

export function visualForProject(project) {
  if (FORCE_COVERS.has(project.id)) {
    return {
      kind: "cover",
      mark: project.visual.mark,
      alt: `${project.name} 排版封面`,
    };
  }
  const mapped = PROJECT_VISUALS[project.id];
  if (mapped) return { kind: "image", ...mapped };
  return {
    kind: "cover",
    mark: project.visual.mark,
    alt: `${project.name} 排版封面`,
  };
}
