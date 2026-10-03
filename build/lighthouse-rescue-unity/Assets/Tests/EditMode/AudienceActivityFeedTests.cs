using LighthouseRescue.Rules;
using LighthouseRescue.Runtime;
using NUnit.Framework;

namespace LighthouseRescue.Tests
{
    public sealed class AudienceActivityFeedTests
    {
        [Test]
        public void AcceptedRepairShowsPublicNameButNeverRawUserId()
        {
            var feed = new AudienceActivityFeed();
            feed.Record(new GameEvent { UserId = "secret-open-id", DisplayName = "海风", Command = GameCommand.Repair }, ApplyResult.Accepted, 1f);
            Assert.That(feed.Current(1f), Is.EqualTo("海风：修理 +1"));
            feed.Record(new GameEvent { UserId = "secret-open-id", Command = GameCommand.Light }, ApplyResult.Accepted, 2f);
            Assert.That(feed.Current(2f), Is.EqualTo("观众：照明 +1"));
        }

        [Test]
        public void UnsafeNameCannotInjectMarkupOrLines()
        {
            var feed = new AudienceActivityFeed();
            feed.Record(new GameEvent { UserId = "u", DisplayName = "<b>海\n风\u202E号</b>超长昵称", Command = GameCommand.Board }, ApplyResult.Accepted, 1f);
            string label = feed.Current(1f);
            Assert.That(label, Does.EndWith("：上船"));
            Assert.That(label, Does.Not.Contain("<"));
            Assert.That(label, Does.Not.Contain(">"));
            Assert.That(label, Does.Not.Contain("\n"));
            Assert.That(label.IndexOf('\u202E'), Is.EqualTo(-1));
            Assert.That(label.IndexOf('：'), Is.LessThanOrEqualTo(8));
        }

        [Test]
        public void RejectedAndHostEventsAreNotCreditedToAudience()
        {
            var feed = new AudienceActivityFeed();
            feed.Record(new GameEvent { DisplayName = "甲", Command = GameCommand.Repair }, ApplyResult.Cooldown, 1f);
            feed.Record(new GameEvent { DisplayName = "船长", Command = GameCommand.Start }, ApplyResult.Accepted, 1f);
            feed.Record(new GameEvent { DisplayName = "船长", Command = GameCommand.CaptainLeft }, ApplyResult.Accepted, 1f);
            Assert.That(feed.Current(1f), Is.Null);
        }

        [Test]
        public void BurstShowsAtMostThreeRecentActionsThenExpires()
        {
            var feed = new AudienceActivityFeed();
            feed.Record(new GameEvent { DisplayName = "甲", Command = GameCommand.Board }, ApplyResult.Accepted, 0f);
            feed.Record(new GameEvent { DisplayName = "乙", Command = GameCommand.VoteLeft }, ApplyResult.Accepted, .1f);
            feed.Record(new GameEvent { DisplayName = "丙", Command = GameCommand.Repair }, ApplyResult.Accepted, .2f);
            feed.Record(new GameEvent { DisplayName = "丁", Command = GameCommand.Light }, ApplyResult.Accepted, .3f);
            Assert.That(feed.Current(.3f), Is.EqualTo("丁：照明 +1"));
            Assert.That(feed.Current(2f), Is.EqualTo("丙：修理 +1"));
            Assert.That(feed.Current(3.6f), Is.EqualTo("乙：投左路"));
            Assert.That(feed.Current(5.4f), Is.Null);
        }

        [Test]
        public void ResetRemovesPreviousRoundActions()
        {
            var feed = new AudienceActivityFeed();
            feed.Record(new GameEvent { DisplayName = "甲", Command = GameCommand.Board }, ApplyResult.Accepted, 1f);
            feed.Reset();
            Assert.That(feed.Current(1.1f), Is.Null);
        }

        [Test]
        public void CombiningMarkFloodCannotCreateAnUnboundedHudLabel()
        {
            var feed = new AudienceActivityFeed();
            feed.Record(new GameEvent { DisplayName = "a" + new string('\u0301', 2048) + "海风",
                Command = GameCommand.Repair }, ApplyResult.Accepted, 1f);
            string label = feed.Current(1f);
            Assert.That(label.Length, Is.LessThanOrEqualTo(24));
            Assert.That(label, Does.EndWith("：修理 +1"));
        }

        [Test]
        public void ValidEmojiNameRemainsVisible()
        {
            var feed = new AudienceActivityFeed();
            feed.Record(new GameEvent { DisplayName = "🚢", Command = GameCommand.Board }, ApplyResult.Accepted, 1f);
            Assert.That(feed.Current(1f), Is.EqualTo("🚢：上船"));
        }
    }
}
