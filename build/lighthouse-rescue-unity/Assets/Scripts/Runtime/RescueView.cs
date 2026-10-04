using System;
using LighthouseRescue.Rules;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace LighthouseRescue.Runtime
{
    public sealed class RescueView : MonoBehaviour
    {
        private static readonly Color Navy = Hex("0C2033");
        private static readonly Color Card = Hex("15354B");
        private static readonly Color Sea = Hex("14506B");
        private static readonly Color Gold = Hex("FFD983");
        private static readonly Color Mint = Hex("8DE2CF");
        private static readonly Color SoftWhite = Hex("EDF7F5");
        private static readonly Color MutedText = Hex("ADC5CC");
        private static readonly float[] LightningOffsetX = { 0f, 23f, -16f, 38f, 11f, 45f, 18f };
        private static readonly float[] LightningOffsetY = { 0f, 38f, 83f, 118f, 164f, 199f, 243f };
        private static readonly float[] LightningGaps = { 6.4f, 8.9f, 7.2f, 10.1f, 6.8f, 9.3f };
        private static readonly float[] PovSceneOffsets = { -89f, -10f, -177f };
        private const float LightningDuration = 0.22f;
        private const float CheckpointProgressWidth = 200f;

        public static float LightningInterval(int strikeIndex, int checkpointNumber)
        {
            return LightningGaps[(strikeIndex + Mathf.Max(0, checkpointNumber - 1) * 2) % LightningGaps.Length];
        }

        public static float RescueBob(float storm, float seconds)
        {
            float strength = Mathf.Clamp01(storm);
            return Mathf.Sin(seconds * 2.4f) * Mathf.Lerp(3f, 10f, strength) +
                Mathf.Sin(seconds * 4.1f + 0.8f) * Mathf.Lerp(0.4f, 2f, strength);
        }

        public static float WindGust(float seconds)
        {
            return 0.5f + 0.5f * Mathf.Sin(seconds * 0.78f - 0.8f + 0.24f * Mathf.Sin(seconds * 1.91f));
        }

        public static float LightningPulse(float age)
        {
            if (age < 0f || age >= LightningDuration) return 0f;
            if (age < 0.055f) return 1f - age / 0.055f;
            if (age < 0.11f) return 0f;
            return 0.72f * (1f - (age - 0.11f) / (LightningDuration - 0.11f));
        }
        private RectTransform root;
        private RectTransform ship;
        private Image overheadSea;
        private Image[] rescuePOV;
        private Image wake;
        private Image giftGlow;
        private Image[] giftSparks;
        private Image hullFlash;
        private Image haze;
        private Image beam;
        private Image povBeam;
        private Image povLightCone;
        private Image lightningFlash;
        private Image[] lightningBolt;
        private Image hullFill;
        private Image repairFill;
        private Image lightFill;
        private Text timer;
        private Text stageTitle;
        private Text instruction;
        private Text routeText;
        private Text scoreText;
        private Text hullText;
        private Text repairText;
        private Text lightText;
        private Text crewText;
        private Text feedbackText;
        private Text rescueToast;
        private Text speedText;
        private Text modeText;
        private Button speedButton;
        private LiveConnectionStatus liveStatus;
        private Text muteText;
        private Text resultTitle;
        private Text resultDetail;
        private Image[] resultCrew;
        private Image[] waitingCrew;
        private Image[] rain;
        private Image[] spray;
        private Image[] lensRain;
        private Image[] windGusts;
        private Image[] searchlightMist;
        private Image[] foregroundSpray;
        private GameObject resultCard;
        private GameObject recoveryCard;
        private Button boardButton, leftButton, rightButton, repairButton, lightButton, likeButton, giftButton;
        private Button startButton, pauseButton, endButton, resetButton, captainLeftButton, captainRightButton;
        private Button recoverButton, restartRecoveryButton;
        private Font font;
        private AudioSource sound;
        private AudioSource weatherSound;
        private AudioSource thunderSource;
        private AudioSource windSource;
        private AudioClip clickSound, confirmSound, warningSound, rescueSound, thunderSound, splashSound;
        private HostControls host;
        private GamePhase lastPhase = GamePhase.Waiting;
        private float feedbackUntil;
        private float rescueToastUntil;
        private float giftGlowUntil;
        private float hullFlashUntil;
        private int lastSavedCount = -1;
        private int lastHull = -1;
        private float weatherClock;
        private float nextLightningAt = 8f;
        private float lightningUntil;
        private float pendingThunderAt = -1f;
        private float nextWindAt = 3f;
        private int lightningStrikeIndex;
        private int lastLightTarget;
        private int lastRepairTarget;
        private readonly AudienceActivityFeed audienceFeed = new AudienceActivityFeed();
        private string lastRoundId;
        private string lastAudienceItem = "";

        public static float StormIntensity(RescueSnapshot snapshot)
        {
            if (snapshot == null) return 0f;
            var phase = snapshot.Phase == GamePhase.Paused ? snapshot.PhaseBeforePause : snapshot.Phase;
            switch (phase)
            {
                case GamePhase.Gathering: return 0.2f;
                case GamePhase.Voting: return 0.32f;
                case GamePhase.Checkpoint1: return 0.58f;
                case GamePhase.Checkpoint2: return 0.79f;
                case GamePhase.Checkpoint3: return 1f;
                case GamePhase.Finale: return 0.48f;
                default: return 0f;
            }
        }

        public static bool IsRescuePOV(RescueSnapshot snapshot)
        {
            if (snapshot == null) return false;
            var phase = snapshot.Phase == GamePhase.Paused ? snapshot.PhaseBeforePause : snapshot.Phase;
            return phase == GamePhase.Checkpoint1 || phase == GamePhase.Checkpoint2 || phase == GamePhase.Checkpoint3;
        }

        public static string DescribeStage(RescueSnapshot snapshot)
        {
            if (snapshot == null) return "准备救援";
            switch (snapshot.Phase)
            {
                case GamePhase.Waiting: return "救起 3 人，驶向灯塔。点击开始。";
                case GamePhase.Gathering: return "评论“上船”，免费加入救援队。";
                case GamePhase.Voting: return "评论“左”或“右”，决定航线。";
                case GamePhase.Checkpoint1:
                case GamePhase.Checkpoint2:
                case GamePhase.Checkpoint3:
                    return "修理保船，照明救人；点赞补光。";
                case GamePhase.Finale: return "驶向灯塔，准备查看救援结果。";
                case GamePhase.Paused: return "已暂停，恢复后继续倒计时。";
                case GamePhase.Result: return "本局结束，点击再来一局。";
                default: return "准备救援";
            }
        }

        public static string DescribeEnding(GameOutcome outcome)
        {
            switch (outcome)
            {
                case GameOutcome.FullSuccess: return "完美救援 · 3 人平安上船";
                case GameOutcome.PartialSuccess: return "部分救援 · 仍有希望";
                case GameOutcome.Failure: return "救援失败 · 下局再战";
                default: return "救援进行中";
            }
        }

        public void Build(HostControls controls)
        {
            host = controls;
            font = Resources.Load<Font>("Fonts/NotoSansSC-VF") ?? Resources.GetBuiltinResource<Font>("Arial.ttf");
            sound = gameObject.AddComponent<AudioSource>();
            sound.playOnAwake = false;
            weatherSound = gameObject.AddComponent<AudioSource>();
            weatherSound.playOnAwake = false;
            weatherSound.loop = true;
            weatherSound.clip = Resources.Load<AudioClip>("Audio/StormRain");
            clickSound = Resources.Load<AudioClip>("Audio/Click");
            confirmSound = Resources.Load<AudioClip>("Audio/Confirm");
            warningSound = Resources.Load<AudioClip>("Audio/Warning");
            rescueSound = Resources.Load<AudioClip>("Audio/Rescue");
            thunderSound = Resources.Load<AudioClip>("Audio/Thunder");
            thunderSource = gameObject.AddComponent<AudioSource>();
            thunderSource.playOnAwake = false;
            thunderSource.clip = thunderSound;
            thunderSource.volume = 0f;
            windSource = gameObject.AddComponent<AudioSource>();
            windSource.playOnAwake = false;
            windSource.clip = Resources.Load<AudioClip>("Audio/WindGust");
            windSource.volume = 0f;
            splashSound = Resources.Load<AudioClip>("Audio/Splash");
            var canvasObject = new GameObject("Lighthouse rescue 9:16 canvas", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;
            var scaler = canvasObject.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1080, 1920);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.Expand;
            Panel(canvasObject.transform, "Outer background", 0, 0, 1080, 1920, Navy);
            root = Rect(canvasObject.transform, "Portrait stage", 0, 0, 1080, 1920);
            var canvasRect = canvasObject.GetComponent<RectTransform>();
            root.anchorMin = root.anchorMax = new Vector2(0.5f, 0.5f);
            root.pivot = new Vector2(0.5f, 0.5f);
            root.anchoredPosition = Vector2.zero;

            Panel(root, "Top accent", 0, 0, 1080, 12, Gold);
            Label(root, "灯塔救援队", 60, 49, 700, 72, 62, Gold, FontStyle.Bold);
            Label(root, "L I G H T H O U S E  R E S C U E", 64, 128, 730, 35, 25, Mint);
            Panel(root, "Mode badge", 60, 177, 500, 53, Hex("295A63"));
            modeText = Label(root, "本地演示 · 非直播连接", 79, 181, 470, 45, 36, SoftWhite, FontStyle.Bold);
            timer = Label(root, "00:00", 800, 64, 220, 80, 62, SoftWhite, FontStyle.Bold, TextAnchor.MiddleRight);
            Panel(root, "Intro card border", 48, 257, 984, 153, Gold);
            Panel(root, "Intro card", 52, 261, 976, 145, Card);
            stageTitle = Label(root, "准备起航", 78, 274, 910, 55, 42, Gold, FontStyle.Bold);
            instruction = Label(root, "", 78, 333, 904, 62, 40, SoftWhite);

            Panel(root, "Sea frame", 43, 433, 994, 639, Hex("42697A"));
            Panel(root, "Sea", 48, 438, 984, 629, Sea);
            overheadSea = Picture(root, "Night sea art", "Art/NightSeaV2", 48, 438, 984, 629, false);
            overheadSea.preserveAspect = false;
            var povViewport = Rect(root, "First-person viewport", 48, 438, 984, 629);
            povViewport.gameObject.AddComponent<RectMask2D>();
            rescuePOV = new Image[3];
            for (int i = 0; i < rescuePOV.Length; i++)
            {
                rescuePOV[i] = Picture(povViewport, "First-person rescue " + (i + 1), "Art/RescuePOV" + (i + 1), PovSceneOffsets[i], -50, 1162, 742, false);
                rescuePOV[i].preserveAspect = false;
                rescuePOV[i].gameObject.SetActive(false);
            }
            var glowSprite = CreateGlowSprite();
            povLightCone = Panel(root, "Survivor light cone", 226, 566, 540, 284, Color.clear);
            povLightCone.sprite = CreateBeamSprite();
            povLightCone.gameObject.SetActive(false);
            povBeam = Panel(root, "Searchlight on survivor", 305, 520, 510, 392, Color.clear);
            povBeam.sprite = glowSprite;
            povBeam.gameObject.SetActive(false);
            giftGlow = Panel(root, "Lighthouse celebration", 795, 457, 177, 177, Color.clear);
            giftGlow.sprite = glowSprite;
            giftSparks = new Image[8];
            for (int i = 0; i < giftSparks.Length; i++)
            {
                giftSparks[i] = Panel(root, "Gift spark " + i, 872, 533, 32, 32, Color.clear);
                giftSparks[i].sprite = glowSprite;
            }
            wake = Panel(root, "Boat wake", 399, 824, 281, 153, new Color(0.58f, 0.91f, 1f, 0.28f));
            wake.sprite = glowSprite;
            beam = Panel(root, "Light beam", 474, 515, 428, 245, Color.white);
            beam.sprite = CreateBeamSprite();
            beam.rectTransform.localEulerAngles = new Vector3(0, 0, -20);
            var shipImage = Picture(root, "Rescue ship", "Art/RescueShipV2", 405, 666, 270, 337, false);
            ship = shipImage.rectTransform;
            waitingCrew = new Image[3];
            for (int i = 0; i < 3; i++)
            {
                waitingCrew[i] = Picture(root, "Waiting survivor " + i, "Art/SurvivorV2", 91 + 86 * i, 586, 80, 80, false);
            }
            rain = new Image[48];
            for (int i = 0; i < rain.Length; i++)
            {
                rain[i] = Panel(root, "Storm rain " + i, 65 + ((i * 193) % 940), 450 + ((i * 71) % 590), 3 + i % 3, 38 + i % 4 * 14, Color.clear);
                rain[i].rectTransform.localEulerAngles = new Vector3(0, 0, 18);
            }
            spray = new Image[18];
            for (int i = 0; i < spray.Length; i++)
            {
                spray[i] = Panel(root, "Storm spray " + i, 65 + ((i * 263) % 900), 895 + ((i * 41) % 150), 27 + i % 3 * 14, 27 + i % 3 * 14, Color.clear);
                spray[i].sprite = glowSprite;
            }
            haze = Panel(root, "Weather haze", 48, 438, 984, 629, new Color(0.75f, 0.9f, 0.91f, 0));
            haze.raycastTarget = false;
            lightningFlash = Panel(root, "Lightning sky flash", 48, 438, 984, 629, Color.clear);
            lightningBolt = new Image[6];
            for (int i = 0; i < lightningBolt.Length; i++)
                lightningBolt[i] = Panel(root, "Lightning branch " + i, 0, 0, 6, 80, Color.clear);
            lensRain = new Image[14];
            for (int i = 0; i < lensRain.Length; i++)
            {
                lensRain[i] = Panel(root, "Lens rain " + i, 95 + (i * 227) % 880,
                    455 + (i * 59) % 580, 11 + i % 3 * 4, 44 + i % 4 * 12, Color.clear);
                lensRain[i].sprite = glowSprite;
                lensRain[i].rectTransform.localEulerAngles = new Vector3(0, 0, 9f);
                lensRain[i].gameObject.SetActive(false);
            }
            windGusts = new Image[12];
            for (int i = 0; i < windGusts.Length; i++)
            {
                windGusts[i] = Panel(root, "Wind gust " + i, 80, 460, 45 + i % 3 * 18, 2 + i % 2, Color.clear);
                windGusts[i].rectTransform.localEulerAngles = new Vector3(0, 0, 18f);
            }
            searchlightMist = new Image[16];
            for (int i = 0; i < searchlightMist.Length; i++)
            {
                searchlightMist[i] = Panel(root, "Searchlight mist " + i, 475, 640, 9 + i % 4 * 5,
                    9 + i % 4 * 5, Color.clear);
                searchlightMist[i].sprite = glowSprite;
                searchlightMist[i].gameObject.SetActive(false);
            }
            foregroundSpray = new Image[28];
            for (int i = 0; i < foregroundSpray.Length; i++)
            {
                int size = 7 + i % 5 * 5;
                foregroundSpray[i] = Panel(root, "Foreground spray " + i, 90, 920, size, size, Color.clear);
                foregroundSpray[i].sprite = glowSprite;
                foregroundSpray[i].gameObject.SetActive(false);
            }
            hullFlash = Panel(root, "Hull damage flash", 48, 438, 984, 629, Color.clear);
            Panel(root, "Map info scrim", 48, 939, 984, 128, new Color(0.02f, 0.10f, 0.16f, 0.74f));
            rescueToast = Label(root, "", 261, 739, 558, 80, 42, Gold, FontStyle.Bold, TextAnchor.MiddleCenter);
            routeText = Label(root, "", 71, 950, 935, 58, 37, SoftWhite, FontStyle.Bold, TextAnchor.MiddleCenter);

            Panel(root, "Status panel", 48, 1091, 984, 213, Card);
            scoreText = Label(root, "", 76, 1108, 930, 54, 36, Gold, FontStyle.Bold);
            hullText = Label(root, "", 76, 1172, 325, 43, 34, SoftWhite);
            Panel(root, "Hull track", 397, 1180, 568, 26, Hex("274958"));
            hullFill = Panel(root, "Hull fill", 397, 1180, 568, 26, Mint);
            repairText = Label(root, "", 76, 1225, 216, 42, 34, SoftWhite);
            repairFill = Panel(root, "Repair progress", 292, 1236, CheckpointProgressWidth, 18, Gold);
            lightText = Label(root, "", 548, 1225, 216, 42, 34, SoftWhite);
            lightFill = Panel(root, "Light progress", 764, 1236, CheckpointProgressWidth, 18, Gold);
            crewText = Label(root, "", 61, 1320, 920, 65, 38, MutedText);

            boardButton = MakeButton("上船", 48, 1406, 310, 105, host.Board, Mint);
            leftButton = MakeButton("选左 · 短路", 382, 1406, 316, 105, host.VoteLeft, Gold);
            rightButton = MakeButton("选右 · 长路", 722, 1406, 310, 105, host.VoteRight, Gold);
            repairButton = MakeButton("修理船体", 48, 1532, 477, 105, host.Repair, Mint);
            lightButton = MakeButton("照明救人", 548, 1532, 484, 105, host.Light, Gold);
            captainLeftButton = MakeButton("船长裁定左", 48, 1522, 477, 125, host.CaptainLeft, Gold, 40);
            captainRightButton = MakeButton("船长裁定右", 548, 1522, 484, 125, host.CaptainRight, Mint, 40);
            likeButton = MakeButton("点赞 ×20 补光", 48, 1658, 477, 96, host.Like, Mint);
            giftButton = MakeButton("礼物烟花 · 纯外观", 548, 1658, 484, 96, host.Gift, Hex("D2ABC8"));
            feedbackText = Label(root, "", 64, 1763, 952, 55, 36, Gold, FontStyle.Bold, TextAnchor.MiddleCenter);

            startButton = MakeButton("开始 / 再来", 46, 1824, 214, 75, host.StartRound, Gold, 33);
            pauseButton = MakeButton("暂停 / 恢复", 269, 1824, 199, 75, host.PauseOrResume, Mint, 33);
            endButton = MakeButton("结束", 477, 1824, 128, 75, host.EndRound, Hex("D2ABC8"), 33);
            muteText = MakeButton("静音", 614, 1824, 128, 75, host.ToggleMute, MutedText, 33).GetComponentInChildren<Text>();
            resetButton = MakeButton("重置", 751, 1824, 128, 75, host.ResetRound, MutedText, 33);
            speedButton = MakeButton("1×", 888, 1824, 144, 75, host.ToggleSpeed, MutedText, 33);
            speedText = speedButton.GetComponentInChildren<Text>();

            resultCard = Panel(root, "Ending illustration", 141, 529, 798, 460, Hex("183747")).gameObject;
            Panel(resultCard.transform, "Ending accent", 0, 0, 798, 13, Gold);
            resultTitle = Label(resultCard.transform, "", 35, 75, 728, 100, 51, Gold, FontStyle.Bold, TextAnchor.MiddleCenter);
            resultCrew = new Image[3];
            for (int i = 0; i < 3; i++)
                resultCrew[i] = Picture(resultCard.transform, "Rescued survivor " + i, "Art/SurvivorV2", 203 + i * 137, 156, 119, 119, false);
            resultDetail = Label(resultCard.transform, "", 25, 282, 748, 168, 38, SoftWhite, FontStyle.Bold, TextAnchor.MiddleCenter);
            resultCard.SetActive(false);
            if (FindObjectOfType<EventSystem>() == null)
                new GameObject("UI Event System", typeof(EventSystem), typeof(StandaloneInputModule));
        }

        public void Render(RescueSnapshot s)
        {
            if (s == null || root == null) return;
            bool localDemo = liveStatus == null;
            bool liveFault = !localDemo && liveStatus.State == LiveConnectionState.Faulted;
            bool recoveryPending = recoveryCard != null && recoveryCard.activeSelf;
            modeText.text = localDemo ? "本地演示 · 非直播连接" :
                liveFault ? "直播已停止 · " + liveStatus.FaultTitle :
                liveStatus.IsConnected ? "抖音直播 · 已连接" : "直播断开 · 等待重连";
            if (lastRoundId != s.RoundId)
            {
                audienceFeed.Reset();
                lastAudienceItem = "";
                lastRoundId = s.RoundId;
            }
            if (lastSavedCount >= 0 && s.SavedCount > lastSavedCount)
            {
                rescueToast.text = "✦ 已救起第 " + s.SavedCount + " 位待救者 ✦";
                rescueToastUntil = Time.unscaledTime + 2.4f;
                Play(rescueSound);
                Play(splashSound, 0.23f);
            }
            if (lastHull >= 0 && s.Hull < lastHull) hullFlashUntil = Time.unscaledTime + 0.8f;
            lastSavedCount = s.SavedCount;
            lastHull = s.Hull;
            if (s.Phase != lastPhase)
            {
                if (s.Phase != GamePhase.Paused && !IsRescuePOV(s))
                {
                    thunderSource.Stop();
                    pendingThunderAt = -1f;
                    lightningUntil = 0f;
                }
                if (s.Phase == GamePhase.Result) Play(rescueSound);
                else if (s.Phase == GamePhase.Checkpoint1 || s.Phase == GamePhase.Checkpoint2 || s.Phase == GamePhase.Checkpoint3)
                {
                    if (lastPhase != GamePhase.Paused)
                    {
                        Play(warningSound);
                        lightningUntil = weatherClock + LightningDuration;
                        pendingThunderAt = weatherClock + 0.26f;
                        lightningStrikeIndex = 0;
                        nextLightningAt = weatherClock + LightningInterval(lightningStrikeIndex++, s.CheckpointNumber);
                    }
                }
                lastPhase = s.Phase;
            }
            timer.text = s.Phase == GamePhase.Waiting || s.Phase == GamePhase.Result ? "--:--" : "00:" + Mathf.CeilToInt((float)s.RemainingSeconds).ToString("00");
            stageTitle.text = StageTitle(s);
            instruction.text = liveFault ? liveStatus.Reason : DescribeStage(s);
            routeText.text = s.Phase == GamePhase.Voting ? "左：短路 修4 光3｜右：长路 修3 光4" :
                s.Route == RescueRoute.ShortLeft ? "当前路线：礁石短路 · 快，但更伤船" :
                s.Route == RescueRoute.LongRight ? "当前路线：迷雾长路 · 慢，需要更多光" : "观众可免费投票决定航线";
            scoreText.text = "已救 " + s.SavedCount + "/3｜船员 " + s.JoinedCount + "｜左 " + s.LeftVotes + ":" + s.RightVotes + " 右";
            hullText.text = "船体 " + s.Hull + " / 100";
            SetFill(hullFill, 568, Mathf.Clamp01(s.Hull / 100f));
            hullFill.color = s.Hull < 30 ? Hex("EF8C83") : Mint;
            var checkpoint = s.Phase == GamePhase.Checkpoint1 || s.Phase == GamePhase.Checkpoint2 || s.Phase == GamePhase.Checkpoint3;
            if (checkpoint)
            {
                lastLightTarget = s.LightTarget;
                lastRepairTarget = s.RepairTarget;
            }
            int effectiveLightTarget = s.Phase == GamePhase.Paused && IsRescuePOV(s) ? lastLightTarget : s.LightTarget;
            int effectiveRepairTarget = s.Phase == GamePhase.Paused && IsRescuePOV(s) ? lastRepairTarget : s.RepairTarget;
            repairText.text = effectiveRepairTarget == 0 ? "修理 --" : "修理 " + s.RepairProgress + " / " + effectiveRepairTarget;
            lightText.text = effectiveLightTarget == 0 ? "照明 --" : "照明 " + s.LightProgress + " / " + effectiveLightTarget;
            SetFill(repairFill, CheckpointProgressWidth, effectiveRepairTarget == 0 ? 0 : (float)s.RepairProgress / effectiveRepairTarget);
            SetFill(lightFill, CheckpointProgressWidth, effectiveLightTarget == 0 ? 0 : (float)s.LightProgress / effectiveLightTarget);
            string audienceItem = audienceFeed.Current(Time.unscaledTime);
            if (lastAudienceItem != audienceItem)
            {
                crewText.text = audienceItem == null ? "每段自带 1 格值守｜免费参与能改变结局" : "值守各1格｜" + audienceItem;
                crewText.color = audienceItem == null ? MutedText : Mint;
                lastAudienceItem = audienceItem;
            }
            bool pov = IsRescuePOV(s);
            int povStage = Mathf.Clamp(s.CheckpointNumber == 0 ? (int)(s.Phase == GamePhase.Paused ? s.PhaseBeforePause : s.Phase) - (int)GamePhase.Checkpoint1 + 1 : s.CheckpointNumber, 1, 3);
            overheadSea.gameObject.SetActive(!pov);
            for (int i = 0; i < rescuePOV.Length; i++) rescuePOV[i].gameObject.SetActive(pov && i == povStage - 1);
            ship.gameObject.SetActive(!pov);
            wake.gameObject.SetActive(!pov);
            beam.gameObject.SetActive(!pov);
            povLightCone.gameObject.SetActive(pov);
            povBeam.gameObject.SetActive(pov);
            for (int i = 0; i < waitingCrew.Length; i++) waitingCrew[i].gameObject.SetActive(!pov);
            boardButton.transform.parent.gameObject.SetActive(localDemo);
            leftButton.transform.parent.gameObject.SetActive(localDemo);
            rightButton.transform.parent.gameObject.SetActive(localDemo);
            likeButton.transform.parent.gameObject.SetActive(localDemo);
            giftButton.transform.parent.gameObject.SetActive(localDemo);
            speedButton.transform.parent.gameObject.SetActive(localDemo);
            boardButton.interactable = localDemo && s.Phase != GamePhase.Waiting && s.Phase != GamePhase.Result && s.Phase != GamePhase.Paused;
            leftButton.interactable = rightButton.interactable = s.Phase == GamePhase.Voting;
            captainLeftButton.interactable = captainRightButton.interactable = s.Phase == GamePhase.Voting && !liveFault && !recoveryPending;
            captainLeftButton.transform.parent.gameObject.SetActive(s.Phase == GamePhase.Voting);
            captainRightButton.transform.parent.gameObject.SetActive(s.Phase == GamePhase.Voting);
            repairButton.transform.parent.gameObject.SetActive(localDemo && s.Phase != GamePhase.Voting);
            lightButton.transform.parent.gameObject.SetActive(localDemo && s.Phase != GamePhase.Voting);
            repairButton.interactable = lightButton.interactable = likeButton.interactable = checkpoint;
            giftButton.interactable = s.Phase != GamePhase.Waiting && s.Phase != GamePhase.Result && s.Phase != GamePhase.Paused;
            startButton.interactable = !liveFault && !recoveryPending && (s.Phase == GamePhase.Waiting || s.Phase == GamePhase.Result);
            pauseButton.interactable = !liveFault && !recoveryPending && s.Phase != GamePhase.Waiting && s.Phase != GamePhase.Result;
            endButton.interactable = !liveFault && !recoveryPending;
            resetButton.interactable = !liveFault && !recoveryPending && (localDemo || liveStatus.IsConnected);
            if (recoveryPending)
                recoverButton.interactable = restartRecoveryButton.interactable = !liveFault && (localDemo || liveStatus.IsConnected);
            float storm = StormIntensity(s);
            if (liveFault)
            {
                lightningUntil = 0f;
                pendingThunderAt = -1f;
                thunderSource.Stop();
                windSource.Stop();
            }
            if (s.Phase != GamePhase.Paused && !liveFault) weatherClock += Mathf.Min(Time.unscaledDeltaTime, 0.1f);
            float gust = WindGust(weatherClock);
            if (checkpoint && !liveFault && weatherClock >= nextLightningAt)
            {
                lightningUntil = weatherClock + LightningDuration;
                pendingThunderAt = weatherClock + 0.25f;
                nextLightningAt = weatherClock + LightningInterval(lightningStrikeIndex++, s.CheckpointNumber);
            }
            if (!checkpoint || host.Muted) thunderSource.Stop();
            if (!checkpoint || host.Muted || liveFault) windSource.Stop();
            thunderSource.volume = checkpoint && !host.Muted && !liveFault ? 0.27f : 0f;
            windSource.volume = checkpoint && !host.Muted && !liveFault ? 0.13f + 0.15f * storm * gust : 0f;
            if (Application.isPlaying && checkpoint && s.Phase != GamePhase.Paused && !host.Muted && !liveFault &&
                windSource.clip != null && weatherClock >= nextWindAt && gust >= 0.78f)
            {
                windSource.pitch = 0.88f + 0.16f * gust;
                windSource.Play();
                nextWindAt = weatherClock + 5.5f;
            }
            if (host.Muted) pendingThunderAt = -1f;
            if (checkpoint && !host.Muted && pendingThunderAt >= 0f && weatherClock >= pendingThunderAt)
            {
                thunderSource.Play();
                pendingThunderAt = -1f;
            }
            haze.color = new Color(0.54f, 0.65f, 0.72f, storm * (0.07f + 0.02f * Mathf.Sin(weatherClock * 1.8f)));
            hullFlash.color = new Color(0.94f, 0.20f, 0.17f, Mathf.Max(0f, hullFlashUntil - Time.unscaledTime) * 0.22f);
            beam.color = new Color(1f, 0.91f, 0.72f, checkpoint ? 0.32f + 0.46f * Mathf.Clamp01(s.LightTarget == 0 ? 0 : (float)s.LightProgress / s.LightTarget) : 0.48f);
            beam.rectTransform.localEulerAngles = new Vector3(0, 0, -20f + Mathf.Sin(weatherClock * 0.8f) * 5f);
            if (pov)
            {
                rescuePOV[povStage - 1].rectTransform.anchoredPosition = new Vector2(
                    PovSceneOffsets[povStage - 1], 50f + RescueBob(storm, weatherClock));
                float targetX = povStage == 2 ? 130f : povStage == 3 ? 522f : 305f;
                float lightRatio = effectiveLightTarget <= 0 ? 0f : Mathf.Clamp01((float)s.LightProgress / effectiveLightTarget);
                povBeam.rectTransform.anchoredPosition = new Vector2(targetX + Mathf.Sin(weatherClock * 0.82f) * 25f, -520f);
                povBeam.color = new Color(1f, 0.83f, 0.49f, 0.09f + 0.17f * lightRatio);
                povLightCone.rectTransform.anchoredPosition = new Vector2(
                    Mathf.Clamp(targetX - 35f + Mathf.Sin(weatherClock * 0.82f) * 19f, 110f, 475f), -566f);
                povLightCone.rectTransform.localEulerAngles = new Vector3(0f, 0f, povStage == 2 ? 16f : -12f);
                povLightCone.color = new Color(1f, 0.88f, 0.58f, 0.10f + 0.26f * lightRatio);
            }
            float lightning = LightningPulse(LightningDuration - (lightningUntil - weatherClock));
            lightningFlash.color = new Color(0.68f, 0.81f, 1f, lightning * (pov ? 0.31f : 0.18f));
            if (pov) povLightCone.color = new Color(1f, 0.91f, 0.69f,
                Mathf.Min(0.46f, povLightCone.color.a + lightning * 0.08f));
            UpdateLightningBolt(lightning, povStage);
            for (int i = 0; i < lensRain.Length; i++)
            {
                lensRain[i].gameObject.SetActive(pov);
                if (!pov) continue;
                float travel = (weatherClock * (64f + i % 5 * 11f) + i * 59f) % 500f;
                float x = 95f + (i * 227) % 880 + Mathf.Sin(weatherClock * 1.3f + i) * 9f;
                lensRain[i].rectTransform.anchoredPosition = new Vector2(x, -(450f + travel));
                lensRain[i].color = new Color(0.78f, 0.91f, 1f,
                    storm * (0.045f + i % 3 * 0.009f) + lightning * 0.055f);
            }
            for (int i = 0; i < windGusts.Length; i++)
            {
                float travel = (weatherClock * (94f + gust * 125f) + i * 83f) % 820f;
                float height = 460f + (i * 139) % 555;
                windGusts[i].rectTransform.anchoredPosition = new Vector2(78f + travel, -height);
                windGusts[i].color = new Color(0.78f, 0.91f, 1f, storm * (0.08f + 0.18f * gust));
            }
            float mistLight = effectiveLightTarget <= 0 ? 0f : Mathf.Clamp01((float)s.LightProgress / effectiveLightTarget);
            for (int i = 0; i < searchlightMist.Length; i++)
            {
                searchlightMist[i].gameObject.SetActive(pov);
                if (!pov) continue;
                float phase = weatherClock * (0.8f + i % 4 * 0.14f) + i * 2.13f;
                float center = povStage == 2 ? 410f : povStage == 3 ? 790f : 555f;
                float x = Mathf.Clamp(center + Mathf.Sin(phase) * (60f + i % 4 * 23f), 80f, 975f);
                float y = 515f + (i * 37 + weatherClock * (18f + gust * 20f)) % 385f;
                searchlightMist[i].rectTransform.anchoredPosition = new Vector2(x, -y);
                searchlightMist[i].color = new Color(1f, 0.85f, 0.60f,
                    storm * (0.035f + 0.20f * mistLight) * (0.65f + 0.35f * Mathf.Sin(phase) * Mathf.Sin(phase))
                    + lightning * 0.13f);
            }
            for (int i = 0; i < foregroundSpray.Length; i++)
            {
                foregroundSpray[i].gameObject.SetActive(pov);
                if (!pov) continue;
                float phase = weatherClock * (2.2f + i % 4 * 0.3f) + i * 1.51f;
                float rise = Mathf.Abs(Mathf.Sin(phase)) * (55f + i % 4 * 18f);
                float x = 80f + (i * 211) % 900;
                foregroundSpray[i].rectTransform.anchoredPosition = new Vector2(x, -(1005f - rise));
                foregroundSpray[i].color = new Color(0.78f, 0.93f, 1f,
                    (0.10f + 0.24f * Mathf.Abs(Mathf.Sin(phase))) * storm + lightning * 0.18f);
            }
            ship.anchoredPosition = new Vector2(405 + Mathf.Sin(weatherClock * 0.7f) * 8f, -666 + Mathf.Sin(weatherClock * 2f) * 7f);
            ship.localEulerAngles = new Vector3(0, 0, Mathf.Sin(weatherClock * 1.4f) * (2f + 2f * storm));
            wake.color = new Color(0.59f, 0.92f, 1f, 0.19f + 0.06f * Mathf.Sin(weatherClock * 3f));
            giftGlow.color = new Color(1f, 0.77f, 0.34f, Mathf.Max(0f, giftGlowUntil - Time.unscaledTime) * (0.38f + 0.12f * Mathf.Sin(Time.time * 15f)));
            float giftRemaining = Mathf.Max(0f, giftGlowUntil - Time.unscaledTime);
            float giftAge = 1.7f - giftRemaining;
            for (int i = 0; i < giftSparks.Length; i++)
            {
                float angle = i * Mathf.PI * 2f / giftSparks.Length + 0.2f;
                float radius = 24f + giftAge * 68f;
                giftSparks[i].rectTransform.anchoredPosition = new Vector2(882 + Mathf.Cos(angle) * radius, -(543 + Mathf.Sin(angle) * radius));
                giftSparks[i].color = new Color(1f, i % 2 == 0 ? 0.84f : 0.98f, 0.48f, giftRemaining * 0.46f);
            }
            rescueToast.enabled = s.Phase != GamePhase.Result && Time.unscaledTime < rescueToastUntil;
            for (int i = 0; i < waitingCrew.Length; i++) waitingCrew[i].color = i < s.SavedCount ? new Color(1f, 1f, 1f, 0.12f) : Color.white;
            for (int i = 0; i < rain.Length; i++)
            {
                float travel = (weatherClock * (260f + i % 7 * 31f) + i * 89f) % 510f;
                float wind = weatherClock * (54f + i % 4 * 10f) + gust * 38f;
                rain[i].rectTransform.anchoredPosition = new Vector2(85 + ((i * 193 + wind) % 900f), -(440 + travel));
                rain[i].color = new Color(0.77f, 0.9f, 1f,
                    storm * (0.28f + (i % 4) * 0.055f) + lightning * 0.24f);
            }
            for (int i = 0; i < spray.Length; i++)
            {
                float phase = weatherClock * (2.1f + i % 4 * 0.22f) + i * 1.7f;
                float rise = Mathf.Abs(Mathf.Sin(phase)) * (75f + i % 3 * 22f);
                spray[i].rectTransform.anchoredPosition = new Vector2(65 + ((i * 263) % 900), -(1025f - rise));
                spray[i].color = new Color(0.72f, 0.92f, 1f,
                    storm * (pov ? 0.2f : 0.1f) * Mathf.Abs(Mathf.Sin(phase)) + lightning * 0.15f);
            }
            if (host.Muted || liveFault) sound.Stop();
            weatherSound.volume = host.Muted || liveFault ? 0f : storm * (s.Phase == GamePhase.Paused ? 0.04f : 0.14f + 0.08f * gust);
            weatherSound.pitch = 0.94f + 0.10f * gust;
            if (Application.isPlaying && weatherSound.clip != null && !weatherSound.isPlaying && weatherSound.volume > 0f) weatherSound.Play();
            resultCard.SetActive(s.Phase == GamePhase.Result);
            if (s.Phase == GamePhase.Result)
            {
                resultTitle.text = DescribeEnding(s.Outcome);
                for (int i = 0; i < 3; i++) resultCrew[i].color = i < s.SavedCount ? Color.white : new Color(0.37f, 0.48f, 0.51f, 0.8f);
                string contributions = s.ContributionTotalsComplete
                    ? "修理 " + s.RepairActions + "｜照明 " + s.LightActions + "｜点赞补光 " + s.LikeLightPoints
                    : "升级前贡献记录不可用";
                resultDetail.text = "救起 " + s.SavedCount + "/3｜船体 " + s.Hull + "｜" + Mathf.RoundToInt((float)s.ElapsedSeconds) + " 秒\n" +
                    contributions + "\n开始/再来：开启下一局";
            }
            var controller = GetComponent<RescueController>();
            speedText.text = (controller == null ? 1 : controller.Speed).ToString("0") + "×";
            muteText.text = host.Muted ? "开音" : "静音";
            if (Time.unscaledTime > feedbackUntil) feedbackText.text = "";
        }

        public void SetLiveMode(LiveConnectionStatus status)
        {
            liveStatus = status ?? throw new ArgumentNullException(nameof(status));
            if (recoveryCard != null) recoveryCard.SetActive(false);
        }

        public void ResetTransitionBaseline(RescueSnapshot snapshot)
        {
            if (snapshot == null) return;
            audienceFeed.Reset();
            lastAudienceItem = "";
            lastRoundId = snapshot.RoundId;
            lastSavedCount = snapshot.SavedCount;
            lastHull = snapshot.Hull;
            lastPhase = snapshot.Phase;
            if (IsRescuePOV(snapshot))
            {
                var config = GameConfig.Default;
                lastLightTarget = snapshot.Route == RescueRoute.LongRight ? config.LongLightTarget : config.ShortLightTarget;
                lastRepairTarget = snapshot.Route == RescueRoute.LongRight ? config.LongRepairTarget : config.ShortRepairTarget;
            }
            rescueToastUntil = 0f;
            hullFlashUntil = 0f;
            lightningUntil = 0f;
            nextLightningAt = weatherClock + 7.5f;
            pendingThunderAt = -1f;
            thunderSource.Stop();
            windSource.Stop();
            nextWindAt = weatherClock + 3f;
        }

        public void ShowFeedback(GameEvent gameEvent, ApplyResult result)
        {
            if (feedbackText == null || gameEvent == null) return;
            GameCommand command = gameEvent.Command;
            audienceFeed.Record(gameEvent, result, Time.unscaledTime);
            if (command == GameCommand.Gift && result == ApplyResult.Accepted)
                giftGlowUntil = Time.unscaledTime + 1.7f;
            feedbackText.text = DescribeFeedback(command, result);
            feedbackText.color = result == ApplyResult.Accepted ? Mint : Gold;
            feedbackUntil = Time.unscaledTime + 2.4f;
            Play(result == ApplyResult.Accepted ? confirmSound : clickSound);
        }

        private static string DescribeFeedback(GameCommand command, ApplyResult result)
        {
            if (result == ApplyResult.Accepted)
            {
                switch (command)
                {
                    case GameCommand.Start: return "救援已开始";
                    case GameCommand.Pause: return "救援已暂停";
                    case GameCommand.Resume: return "救援已继续";
                    case GameCommand.End: return "本局已结束";
                    case GameCommand.Board: return "上船成功";
                    case GameCommand.VoteLeft: return "左路投票已计入";
                    case GameCommand.VoteRight: return "右路投票已计入";
                    case GameCommand.CaptainLeft: return "船长已裁定左路（平票时生效）";
                    case GameCommand.CaptainRight: return "船长已裁定右路（平票时生效）";
                    case GameCommand.Repair: return "修理已计入";
                    case GameCommand.Light: return "照明已计入";
                    case GameCommand.Like: return "点赞补光已计入";
                    case GameCommand.Gift: return "礼物只点亮烟花，不影响胜负";
                }
            }
            switch (result)
            {
                case ApplyResult.Duplicate: return "重复指令已忽略";
                case ApplyResult.WrongRoom: return "不是当前房间的指令";
                case ApplyResult.WrongRound: return "不是本局的指令";
                case ApplyResult.WrongPhase: return "当前阶段暂不接受该指令";
                case ApplyResult.Cooldown: return "请稍等 3 秒再输入同类指令";
                case ApplyResult.Capped: return "本段贡献已达上限，感谢参与";
                case ApplyResult.Stale: return "过期指令未计入";
                default: return "指令格式无效";
            }
        }

        public void OfferRecovery(Action recover, Action restart)
        {
            recoveryCard = Panel(root, "Recovery prompt", 130, 620, 820, 470, Hex("122C3E")).gameObject;
            Label(recoveryCard.transform, "发现未结束的上一局", 46, 48, 730, 85, 46, Gold, FontStyle.Bold, TextAnchor.MiddleCenter);
            Label(recoveryCard.transform, "可以从已保存的阶段继续，或重新开局。\n恢复不会重复计入已处理事件。", 72, 157, 680, 130, 29, SoftWhite, FontStyle.Normal, TextAnchor.MiddleCenter);
            recoverButton = MakeButtonOn(recoveryCard.transform, "恢复上一局", 51, 326, 343, 83, () =>
            {
                if (liveStatus != null && !liveStatus.IsConnected) return;
                recoveryCard.SetActive(false);
                recover();
            }, Mint);
            restartRecoveryButton = MakeButtonOn(recoveryCard.transform, "重新开局", 425, 326, 343, 83, () =>
            {
                if (liveStatus != null && !liveStatus.IsConnected) return;
                recoveryCard.SetActive(false);
                restart();
            }, Gold);
        }

        private static string StageTitle(RescueSnapshot s)
        {
            switch (s.Phase)
            {
                case GamePhase.Waiting: return "今晚，带他们回家";
                case GamePhase.Gathering: return "01 · 集结船员";
                case GamePhase.Voting: return "02 · 岔路口投票";
                case GamePhase.Checkpoint1: return "03 · 第一处险情";
                case GamePhase.Checkpoint2: return "04 · 第二处险情";
                case GamePhase.Checkpoint3: return "05 · 最后一处险情";
                case GamePhase.Finale: return "06 · 冲向灯塔";
                case GamePhase.Paused: return "救援暂停";
                default: return "本局结算";
            }
        }

        private void Play(AudioClip clip, float volume = 0.35f) { if (clip != null && !host.Muted && (liveStatus == null || liveStatus.State != LiveConnectionState.Faulted)) sound.PlayOneShot(clip, volume); }

        private void UpdateLightningBolt(float alpha, int stage)
        {
            float startX = stage == 2 ? 813f : 312f;
            for (int i = 0; i < lightningBolt.Length; i++)
            {
                Vector2 from = new Vector2(startX + LightningOffsetX[i], 444f + LightningOffsetY[i]);
                Vector2 to = new Vector2(startX + LightningOffsetX[i + 1], 444f + LightningOffsetY[i + 1]);
                Vector2 delta = to - from;
                var rect = lightningBolt[i].rectTransform;
                rect.anchoredPosition = new Vector2(from.x, -from.y);
                rect.sizeDelta = new Vector2(5f + alpha * 4f, delta.magnitude);
                rect.localEulerAngles = new Vector3(0, 0, Mathf.Atan2(delta.x, delta.y) * Mathf.Rad2Deg);
                lightningBolt[i].color = new Color(0.9f, 0.96f, 1f, alpha * 0.88f);
            }
        }
        private static void SetFill(Image image, float max, float ratio) => image.rectTransform.sizeDelta = new Vector2(max * Mathf.Clamp01(ratio), image.rectTransform.sizeDelta.y);
        private Button MakeButton(string title, float x, float y, float w, float h, UnityEngine.Events.UnityAction action, Color color, int size = 39) => MakeButtonOn(root, title, x, y, w, h, action, color, size);
        private Button MakeButtonOn(Transform parent, string title, float x, float y, float w, float h, UnityEngine.Events.UnityAction action, Color color, int size = 39)
        {
            var group = Rect(parent, title + " control", x, y, w, h);
            Panel(group, title + " shadow", 4, 5, w, h, new Color(0f, 0.04f, 0.08f, 0.32f));
            Panel(group, title + " rim", -2, -2, w + 4, h + 4, new Color(0.98f, 0.87f, 0.67f, 0.39f));
            var image = Panel(group, title + " button", 0, 0, w, h, color);
            image.raycastTarget = true;
            var button = image.gameObject.AddComponent<Button>();
            button.targetGraphic = image;
            button.onClick.AddListener(action);
            Label(image.transform, title, 7, 2, w - 14, h - 4, size, Navy, FontStyle.Bold, TextAnchor.MiddleCenter);
            return button;
        }

        private Image Picture(Transform parent, string name, string resource, float x, float y, float w, float h, bool pixelArt = true)
        {
            var image = Panel(parent, name, x, y, w, h, Color.white);
            var texture = Resources.Load<Texture2D>(resource);
            if (texture != null)
            {
                texture.filterMode = pixelArt ? FilterMode.Point : FilterMode.Bilinear;
                image.sprite = Sprite.Create(texture, new Rect(0, 0, texture.width, texture.height), new Vector2(0.5f, 0.5f));
            }
            image.preserveAspect = true;
            image.raycastTarget = false;
            return image;
        }

        private Text Label(Transform parent, string content, float x, float y, float w, float h, int size, Color color, FontStyle style = FontStyle.Normal, TextAnchor anchor = TextAnchor.MiddleLeft)
        {
            var holder = Rect(parent, "Text " + content, x, y, w, h);
            var label = holder.gameObject.AddComponent<Text>();
            label.font = font;
            label.text = content;
            label.fontSize = size;
            label.fontStyle = style;
            label.color = color;
            label.alignment = anchor;
            label.horizontalOverflow = HorizontalWrapMode.Wrap;
            label.verticalOverflow = VerticalWrapMode.Overflow;
            label.supportRichText = false;
            label.raycastTarget = false;
            return label;
        }

        private static Image Panel(Transform parent, string name, float x, float y, float w, float h, Color color)
        {
            var rect = Rect(parent, name, x, y, w, h);
            var image = rect.gameObject.AddComponent<Image>();
            image.color = color;
            image.raycastTarget = false;
            return image;
        }

        private static RectTransform Rect(Transform parent, string name, float x, float y, float w, float h)
        {
            var obj = new GameObject(name, typeof(RectTransform));
            obj.transform.SetParent(parent, false);
            var rect = obj.GetComponent<RectTransform>();
            rect.anchorMin = rect.anchorMax = new Vector2(0, 1);
            rect.pivot = new Vector2(0, 1);
            rect.anchoredPosition = new Vector2(x, -y);
            rect.sizeDelta = new Vector2(w, h);
            return rect;
        }

        private static Color Hex(string value)
        {
            ColorUtility.TryParseHtmlString("#" + value, out Color color);
            return color;
        }

        private static Sprite CreateBeamSprite()
        {
            const int width = 256, height = 128;
            var pixels = new Color[width * height];
            for (int y = 0; y < height; y++)
                for (int x = 0; x < width; x++)
                {
                    float t = x / (float)(width - 1);
                    float half = Mathf.Lerp(0.49f, 0.045f, t);
                    float distance = Mathf.Abs(y / (float)(height - 1) - 0.5f);
                    float alpha = distance >= half ? 0 : (1 - distance / half) * (0.52f - t * 0.18f);
                    pixels[y * width + x] = new Color(1f, 0.85f, 0.44f, alpha);
                }
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false);
            texture.SetPixels(pixels);
            texture.Apply();
            return Sprite.Create(texture, new Rect(0, 0, width, height), new Vector2(0.5f, 0.5f));
        }

        private static Sprite CreateGlowSprite()
        {
            const int size = 96;
            var pixels = new Color[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float dx = (x + 0.5f - size / 2f) / (size / 2f);
                    float dy = (y + 0.5f - size / 2f) / (size / 2f);
                    float alpha = Mathf.Pow(Mathf.Clamp01(1f - dx * dx - dy * dy), 2f);
                    pixels[y * size + x] = new Color(1f, 1f, 1f, alpha);
                }
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, false);
            texture.SetPixels(pixels);
            texture.Apply();
            return Sprite.Create(texture, new Rect(0, 0, size, size), new Vector2(0.5f, 0.5f));
        }
    }
}
