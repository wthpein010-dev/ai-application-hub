using LighthouseRescue.Rules;
using LighthouseRescue.Runtime;
using NUnit.Framework;

namespace LighthouseRescue.Tests
{
    public sealed class LivePushTranslatorTests
    {
        private static LivePushEnvelope Message(string type, string content = null, int count = 1)
        {
            return new LivePushEnvelope
            {
                MessageId = "message-1", MessageType = type, UnixMilliseconds = 100500,
                StableUserId = "open-user-1", DisplayName = "海员甲", Content = content, Count = count
            };
        }

        [Test]
        public void CommentPreservesSdkIdentityAndReplayIsRejectedByRoundRules()
        {
            var translator = new LivePushTranslator();
            var game = new RescueGame(GameConfig.Default, "room-1", "round-1", 7);
            game.Apply(new GameEvent { Source = "host", RoomId = "room-1", RoundId = "round-1", EventId = "start", UserId = "host", Command = GameCommand.Start }, 0);
            var result = translator.Translate(Message("live_comment", "上船"), "room-1", "round-1", 0.5, 100000, 100600, out GameEvent translated);
            Assert.AreEqual(LiveTranslationResult.Accepted, result);
            Assert.AreEqual("douyin", translated.Source);
            Assert.AreEqual("live_comment:message-1", translated.EventId);
            Assert.AreEqual("open-user-1", translated.UserId);
            Assert.AreEqual("海员甲", translated.DisplayName);
            Assert.AreEqual(100500, translated.OccurredUnixMilliseconds);
            Assert.AreEqual(0.5, translated.OccurredAtSeconds);
            var router = new EventRouter();
            Assert.AreEqual(ApplyResult.Accepted, router.Route(translated, game, 0.5));
            Assert.AreEqual(ApplyResult.Duplicate, router.Route(translated, game, 0.6));
            Assert.AreEqual(1, game.Snapshot().JoinedCount);
        }

        [Test]
        public void OldWindowAndFutureSdkMessagesCannotEnterTheCurrentRound()
        {
            var translator = new LivePushTranslator();
            Assert.AreEqual(LiveTranslationResult.Rejected,
                translator.Translate(Message("live_comment", "修理"), "room-1", "round-1", 21, 101000, 101200, out _));
            Assert.AreEqual(LiveTranslationResult.Rejected,
                translator.Translate(Message("live_comment", "修理"), "room-1", "round-1", 21, 100000, 100000, out _));
        }

        [Test]
        public void MissingStableIdentityAndMalformedLikeCountsAreRejected()
        {
            var translator = new LivePushTranslator();
            var noIdentity = Message("live_comment", "左");
            noIdentity.StableUserId = " ";
            Assert.AreEqual(LiveTranslationResult.Rejected,
                translator.Translate(noIdentity, "room-1", "round-1", 22, 100000, 100600, out _));
            Assert.AreEqual(LiveTranslationResult.Rejected,
                translator.Translate(Message("live_like", count: 0), "room-1", "round-1", 22, 100000, 100600, out _));
            Assert.AreEqual(LiveTranslationResult.Accepted,
                translator.Translate(Message("live_like", count: 20), "room-1", "round-1", 22, 100000, 100600, out GameEvent like));
            Assert.AreEqual(GameCommand.Like, like.Command);
            Assert.AreEqual(20, like.Count);
        }

        [Test]
        public void IrrelevantChatIsIgnoredAndGiftRemainsCosmetic()
        {
            var translator = new LivePushTranslator();
            Assert.AreEqual(LiveTranslationResult.Ignored,
                translator.Translate(Message("live_comment", "今晚加油"), "room-1", "round-1", 1, 100000, 100600, out _));
            Assert.AreEqual(LiveTranslationResult.Ignored,
                translator.Translate(Message("live_fansclub"), "room-1", "round-1", 1, 100000, 100600, out _));
            Assert.AreEqual(LiveTranslationResult.Accepted,
                translator.Translate(Message("live_gift"), "room-1", "round-1", 1, 100000, 100600, out GameEvent gift));
            Assert.AreEqual(GameCommand.Gift, gift.Command);
        }
    }
}
