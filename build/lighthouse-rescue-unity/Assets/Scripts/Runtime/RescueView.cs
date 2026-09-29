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
        private RectTransform root;
        private RectTransform ship;
        private Image haze;
        private Image beam;
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
        private Text speedText;
        private Text resultTitle;
        private Text resultDetail;
        private Image[] resultCrew;
        private Image[] waitingCrew;
        private Image[] rain;
        private GameObject resultCard;
        private GameObject recoveryCard;
        private Button boardButton, leftButton, rightButton, repairButton, lightButton, likeButton, giftButton;
        private Button startButton, pauseButton;
        private Font font;
        private AudioSource sound;
        private AudioClip clickSound, confirmSound, warningSound, rescueSound;
        private HostControls host;
        private GamePhase lastPhase = GamePhase.Waiting;
        private float feedbackUntil;

        public static string DescribeStage(RescueSnapshot snapshot)
        {
            if (snapshot == null) return "准备救援";
            switch (snapshot.Phase)
            {
                case GamePhase.Waiting: return "目标：救起 3 人，驶向灯塔。点击开始，邀请观众上船。";
                case GamePhase.Gathering: return "集结中：评论“上船”加入救援队。免费参与，每个人都能帮忙。";
                case GamePhase.Voting: return "选路中：评论“左”走礁石短路，评论“右”走迷雾长路。";
                case GamePhase.Checkpoint1:
                case GamePhase.Checkpoint2:
                case GamePhase.Checkpoint3:
                    return "修理保船，照明救人；每 20 次点赞补一格光。";
                case GamePhase.Finale: return "正在冲向灯塔，三段救援已结束。准备查看结局。";
                case GamePhase.Paused: return "已暂停。恢复后继续当前倒计时，过期指令不会补入。";
                case GamePhase.Result: return "本局结束。查看救援结果，点击再来一局。";
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
            clickSound = Resources.Load<AudioClip>("Audio/Click");
            confirmSound = Resources.Load<AudioClip>("Audio/Confirm");
            warningSound = Resources.Load<AudioClip>("Audio/Warning");
            rescueSound = Resources.Load<AudioClip>("Audio/Rescue");
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
            Panel(root, "Mode badge", 60, 177, 340, 53, Hex("295A63"));
            Label(root, "本地演示 · 非直播连接", 79, 181, 310, 45, 26, SoftWhite, FontStyle.Bold);
            timer = Label(root, "00:00", 800, 64, 220, 80, 62, SoftWhite, FontStyle.Bold, TextAnchor.MiddleRight);
            Panel(root, "Intro card border", 48, 257, 984, 153, Gold);
            Panel(root, "Intro card", 52, 261, 976, 145, Card);
            stageTitle = Label(root, "准备起航", 78, 274, 910, 55, 42, Gold, FontStyle.Bold);
            instruction = Label(root, "", 78, 333, 904, 62, 31, SoftWhite);

            Panel(root, "Sea", 48, 438, 984, 629, Sea);
            Panel(root, "Sea top", 48, 438, 984, 104, Hex("1B687A"));
            for (int i = 0; i < 7; i++)
            {
                var wave = Panel(root, "Wave " + i, 94 + ((i * 143) % 390), 584 + i * 61, 200 + (i % 3) * 56, 5, new Color(0.63f, 0.87f, 0.88f, 0.17f));
                wave.rectTransform.localEulerAngles = new Vector3(0, 0, i % 2 == 0 ? 2 : -2);
            }
            Picture(root, "Island", "Art/Island", 63, 455, 256, 247);
            Picture(root, "Rock left", "Art/RockA", 162, 759, 119, 112);
            Picture(root, "Rock right", "Art/RockB", 851, 774, 125, 112);
            Picture(root, "Rock far", "Art/RockA", 767, 953, 84, 75);
            Panel(root, "Lighthouse island", 739, 497, 215, 81, Hex("D9BE8B"));
            Panel(root, "Lighthouse base", 793, 338 + 190, 106, 245, Hex("F2E7D1"));
            Panel(root, "Lighthouse stripe", 793, 627, 106, 51, Hex("BE655A"));
            Panel(root, "Lighthouse lantern", 777, 481, 138, 61, Gold);
            Panel(root, "Lighthouse roof", 761, 462, 171, 23, Hex("8E554D"));
            beam = Panel(root, "Light beam", 455, 547, 338, 172, Color.white);
            beam.sprite = CreateBeamSprite();
            beam.rectTransform.localEulerAngles = new Vector3(0, 0, -20);
            var shipImage = Picture(root, "Rescue ship", "Art/RescueShip", 440, 700, 205, 254);
            ship = shipImage.rectTransform;
            waitingCrew = new Image[3];
            for (int i = 0; i < 3; i++)
            {
                waitingCrew[i] = Picture(root, "Waiting crew " + i, "Art/Crew" + (char)('A' + i), 99 + 73 * i, 574, 53, 53);
            }
            rain = new Image[9];
            for (int i = 0; i < rain.Length; i++)
            {
                rain[i] = Panel(root, "Rain " + i, 88 + ((i * 107) % 870), 604 + ((i * 53) % 365), 4, 55, new Color(0.74f, 0.9f, 0.94f, 0));
                rain[i].rectTransform.localEulerAngles = new Vector3(0, 0, 21);
            }
            haze = Panel(root, "Weather haze", 48, 438, 984, 629, new Color(0.75f, 0.9f, 0.91f, 0));
            haze.raycastTarget = false;
            routeText = Label(root, "", 71, 978, 935, 65, 30, SoftWhite, FontStyle.Bold, TextAnchor.MiddleCenter);

            Panel(root, "Status panel", 48, 1091, 984, 213, Card);
            scoreText = Label(root, "", 76, 1108, 930, 54, 34, Gold, FontStyle.Bold);
            hullText = Label(root, "", 76, 1172, 325, 43, 28, SoftWhite);
            Panel(root, "Hull track", 397, 1180, 568, 26, Hex("274958"));
            hullFill = Panel(root, "Hull fill", 397, 1180, 568, 26, Mint);
            repairText = Label(root, "", 76, 1225, 388, 42, 28, SoftWhite);
            repairFill = Panel(root, "Repair progress", 468, 1236, 213, 18, Gold);
            lightText = Label(root, "", 698, 1225, 300, 42, 28, SoftWhite);
            lightFill = Panel(root, "Light progress", 921, 1236, 75, 18, Gold);
            crewText = Label(root, "", 61, 1327, 920, 48, 28, MutedText);

            boardButton = MakeButton("上船", 48, 1406, 310, 105, host.Board, Mint);
            leftButton = MakeButton("选左 · 短路", 382, 1406, 316, 105, host.VoteLeft, Gold);
            rightButton = MakeButton("选右 · 长路", 722, 1406, 310, 105, host.VoteRight, Gold);
            repairButton = MakeButton("修理船体", 48, 1532, 477, 105, host.Repair, Mint);
            lightButton = MakeButton("照明救人", 548, 1532, 484, 105, host.Light, Gold);
            likeButton = MakeButton("点赞 ×20 补光", 48, 1658, 477, 96, host.Like, Mint);
            giftButton = MakeButton("礼物烟花 · 纯外观", 548, 1658, 484, 96, host.Gift, Hex("D2ABC8"));
            feedbackText = Label(root, "", 64, 1763, 952, 55, 28, Gold, FontStyle.Bold, TextAnchor.MiddleCenter);

            startButton = MakeButton("开始 / 再来", 46, 1834, 214, 62, host.StartRound, Gold, 25);
            pauseButton = MakeButton("暂停 / 恢复", 269, 1834, 199, 62, host.PauseOrResume, Mint, 25);
            MakeButton("结束", 477, 1834, 128, 62, host.EndRound, Hex("D2ABC8"), 25);
            MakeButton("静音", 614, 1834, 128, 62, host.ToggleMute, MutedText, 25);
            MakeButton("重置", 751, 1834, 128, 62, host.ResetRound, MutedText, 25);
            var speedButton = MakeButton("1×", 888, 1834, 144, 62, host.ToggleSpeed, MutedText, 25);
            speedText = speedButton.GetComponentInChildren<Text>();

            resultCard = Panel(root, "Ending illustration", 141, 529, 798, 427, Hex("183747")).gameObject;
            Panel(resultCard.transform, "Ending accent", 0, 0, 798, 13, Gold);
            resultTitle = Label(resultCard.transform, "", 35, 75, 728, 100, 51, Gold, FontStyle.Bold, TextAnchor.MiddleCenter);
            resultCrew = new Image[3];
            for (int i = 0; i < 3; i++)
                resultCrew[i] = Picture(resultCard.transform, "Rescued crew " + i, "Art/Crew" + (char)('A' + i), 214 + i * 137, 170, 100, 96);
            resultDetail = Label(resultCard.transform, "", 40, 277, 718, 116, 29, SoftWhite, FontStyle.Normal, TextAnchor.MiddleCenter);
            resultCard.SetActive(false);
            if (FindObjectOfType<EventSystem>() == null)
                new GameObject("UI Event System", typeof(EventSystem), typeof(StandaloneInputModule));
        }

        public void Render(RescueSnapshot s)
        {
            if (s == null || root == null) return;
            if (s.Phase != lastPhase)
            {
                if (s.Phase == GamePhase.Result) Play(rescueSound);
                else if (s.Phase == GamePhase.Checkpoint1 || s.Phase == GamePhase.Checkpoint2 || s.Phase == GamePhase.Checkpoint3) Play(warningSound);
                lastPhase = s.Phase;
            }
            timer.text = s.Phase == GamePhase.Waiting || s.Phase == GamePhase.Result ? "--:--" : "00:" + Mathf.CeilToInt((float)s.RemainingSeconds).ToString("00");
            stageTitle.text = StageTitle(s);
            instruction.text = DescribeStage(s);
            routeText.text = s.Phase == GamePhase.Voting ? "礁石短路：修理 4 / 照明 3 　·　 迷雾长路：修理 3 / 照明 4" :
                s.Route == RescueRoute.ShortLeft ? "当前路线：礁石短路 · 快，但更伤船" :
                s.Route == RescueRoute.LongRight ? "当前路线：迷雾长路 · 慢，需要更多光" : "观众可免费投票决定航线";
            scoreText.text = "已救 " + s.SavedCount + " / 3 人　　 船员 " + s.JoinedCount + " 人　　 左 " + s.LeftVotes + " : " + s.RightVotes + " 右";
            hullText.text = "船体 " + s.Hull + " / 100";
            SetFill(hullFill, 568, Mathf.Clamp01(s.Hull / 100f));
            hullFill.color = s.Hull < 30 ? Hex("EF8C83") : Mint;
            repairText.text = s.RepairTarget == 0 ? "修理 --" : "修理 " + s.RepairProgress + " / " + s.RepairTarget;
            lightText.text = s.LightTarget == 0 ? "照明 --" : "照明 " + s.LightProgress + " / " + s.LightTarget;
            SetFill(repairFill, 213, s.RepairTarget == 0 ? 0 : (float)s.RepairProgress / s.RepairTarget);
            SetFill(lightFill, 75, s.LightTarget == 0 ? 0 : (float)s.LightProgress / s.LightTarget);
            crewText.text = "船员席位  " + (s.JoinedCount > 0 ? "● " + s.JoinedCount + " 人同行" : "○ 等待第一位观众") + "　　 系统值守各 1 格，免费指令能改变结局";
            var checkpoint = s.Phase == GamePhase.Checkpoint1 || s.Phase == GamePhase.Checkpoint2 || s.Phase == GamePhase.Checkpoint3;
            boardButton.interactable = s.Phase != GamePhase.Waiting && s.Phase != GamePhase.Result && s.Phase != GamePhase.Paused;
            leftButton.interactable = rightButton.interactable = s.Phase == GamePhase.Voting;
            repairButton.interactable = lightButton.interactable = likeButton.interactable = checkpoint;
            giftButton.interactable = s.Phase != GamePhase.Waiting && s.Phase != GamePhase.Result && s.Phase != GamePhase.Paused;
            startButton.interactable = s.Phase == GamePhase.Waiting || s.Phase == GamePhase.Result;
            pauseButton.interactable = s.Phase != GamePhase.Waiting && s.Phase != GamePhase.Result;
            haze.color = new Color(0.78f, 0.88f, 0.91f, checkpoint ? 0.06f * s.CheckpointNumber : 0f);
            beam.color = new Color(1f, 1f, 1f, checkpoint ? 0.42f + 0.5f * Mathf.Clamp01(s.LightTarget == 0 ? 0 : (float)s.LightProgress / s.LightTarget) : 0.62f);
            ship.anchoredPosition = new Vector2(440, -700 + Mathf.Sin(Time.time * 2f) * 7f);
            for (int i = 0; i < waitingCrew.Length; i++) waitingCrew[i].color = i < s.SavedCount ? new Color(1f, 1f, 1f, 0.12f) : Color.white;
            for (int i = 0; i < rain.Length; i++) rain[i].color = new Color(0.74f, 0.9f, 0.94f, checkpoint ? 0.19f * s.CheckpointNumber : 0f);
            resultCard.SetActive(s.Phase == GamePhase.Result);
            if (s.Phase == GamePhase.Result)
            {
                resultTitle.text = DescribeEnding(s.Outcome);
                for (int i = 0; i < 3; i++) resultCrew[i].color = i < s.SavedCount ? Color.white : new Color(0.37f, 0.48f, 0.51f, 0.8f);
                resultDetail.text = "救起 " + s.SavedCount + " / 3 人 · 船体 " + s.Hull + " 点 · 用时 " + Mathf.RoundToInt((float)s.ElapsedSeconds) + " 秒\n点击“开始 / 再来”开启下一局";
            }
            speedText.text = GetComponent<RescueController>().Speed.ToString("0") + "×";
            if (Time.unscaledTime > feedbackUntil) feedbackText.text = "";
        }

        public void ShowFeedback(GameCommand command, ApplyResult result)
        {
            if (feedbackText == null) return;
            feedbackText.text = result == ApplyResult.Accepted ? "✓ " + command + " 已生效" :
                result == ApplyResult.Cooldown ? "请稍等 3 秒再输入同类指令" :
                result == ApplyResult.Capped ? "本段贡献已达上限，感谢参与" :
                result == ApplyResult.WrongPhase ? "当前阶段暂不接受该指令" : "指令未计入：" + result;
            feedbackText.color = result == ApplyResult.Accepted ? Mint : Gold;
            feedbackUntil = Time.unscaledTime + 2.4f;
            Play(result == ApplyResult.Accepted ? confirmSound : clickSound);
        }

        public void OfferRecovery(Action recover, Action restart)
        {
            recoveryCard = Panel(root, "Recovery prompt", 130, 620, 820, 470, Hex("122C3E")).gameObject;
            Label(recoveryCard.transform, "发现未结束的上一局", 46, 48, 730, 85, 46, Gold, FontStyle.Bold, TextAnchor.MiddleCenter);
            Label(recoveryCard.transform, "可以从已保存的阶段继续，或重新开局。\n恢复不会重复计入已处理事件。", 72, 157, 680, 130, 29, SoftWhite, FontStyle.Normal, TextAnchor.MiddleCenter);
            MakeButtonOn(recoveryCard.transform, "恢复上一局", 51, 326, 343, 83, () => { recoveryCard.SetActive(false); recover(); }, Mint);
            MakeButtonOn(recoveryCard.transform, "重新开局", 425, 326, 343, 83, () => { recoveryCard.SetActive(false); restart(); }, Gold);
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

        private void Play(AudioClip clip) { if (clip != null && !host.Muted) sound.PlayOneShot(clip, 0.35f); }
        private static void SetFill(Image image, float max, float ratio) => image.rectTransform.sizeDelta = new Vector2(max * Mathf.Clamp01(ratio), image.rectTransform.sizeDelta.y);
        private Button MakeButton(string title, float x, float y, float w, float h, UnityEngine.Events.UnityAction action, Color color, int size = 31) => MakeButtonOn(root, title, x, y, w, h, action, color, size);
        private Button MakeButtonOn(Transform parent, string title, float x, float y, float w, float h, UnityEngine.Events.UnityAction action, Color color, int size = 31)
        {
            var image = Panel(parent, title + " button", x, y, w, h, color);
            image.raycastTarget = true;
            var button = image.gameObject.AddComponent<Button>();
            button.targetGraphic = image;
            button.onClick.AddListener(action);
            Label(image.transform, title, 7, 2, w - 14, h - 4, size, Navy, FontStyle.Bold, TextAnchor.MiddleCenter);
            return button;
        }

        private Image Picture(Transform parent, string name, string resource, float x, float y, float w, float h)
        {
            var image = Panel(parent, name, x, y, w, h, Color.white);
            var texture = Resources.Load<Texture2D>(resource);
            if (texture != null)
            {
                texture.filterMode = FilterMode.Point;
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
    }
}
