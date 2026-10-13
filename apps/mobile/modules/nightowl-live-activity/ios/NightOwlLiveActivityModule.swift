import ActivityKit
import ExpoModulesCore

/// The JavaScript shape of NightOwlAttributes.ContentState.
struct ContentRecord: Record {
  @Field var winningLeaguesCount: Int = 0
  @Field var totalActiveLeagues: Int = 0
  @Field var netPortfolioPointsToday: Double = 0
  @Field var latestPlayHeadline: String = ""
  @Field var latestPlayDeltaText: String = ""
  @Field var isPositivePlay: Bool = true
  @Field var updatedAtEpoch: Int = 0
  @Field var closestMatchups: [String] = []

  var state: NightOwlAttributes.ContentState {
    NightOwlAttributes.ContentState(
      winningLeaguesCount: winningLeaguesCount,
      totalActiveLeagues: totalActiveLeagues,
      netPortfolioPointsToday: netPortfolioPointsToday,
      latestPlayHeadline: latestPlayHeadline,
      latestPlayDeltaText: latestPlayDeltaText,
      isPositivePlay: isPositivePlay,
      updatedAtEpoch: updatedAtEpoch,
      closestMatchups: closestMatchups
    )
  }
}

/// A game-day activity goes stale if the app stops updating it (backgrounded):
/// iOS dims it rather than showing old scores as live.
private let staleAfter: TimeInterval = 10 * 60

public class NightOwlLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("NightOwlLiveActivity")

    Function("areActivitiesEnabled") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    Function("isRunning") { () -> Bool in
      if #available(iOS 16.2, *) {
        return Activity<NightOwlAttributes>.activities.contains { $0.activityState == .active }
      }
      return false
    }

    AsyncFunction("start") { (username: String, nflWeek: Int, content: ContentRecord, promise: Promise) in
      guard #available(iOS 16.2, *) else {
        promise.resolve(nil)
        return
      }
      let state = content.state
      let attributes = NightOwlAttributes(sleeperUsername: username, nflWeek: nflWeek)
      do {
        let activity = try Activity.request(
          attributes: attributes,
          content: ActivityContent(state: state, staleDate: Date().addingTimeInterval(staleAfter)),
          pushType: nil
        )
        promise.resolve(activity.id)
      } catch {
        promise.reject("ERR_LIVE_ACTIVITY_START", error.localizedDescription)
      }
    }

    AsyncFunction("update") { (content: ContentRecord, promise: Promise) in
      guard #available(iOS 16.2, *) else {
        promise.resolve(nil)
        return
      }
      let state = content.state
      Task {
        for activity in Activity<NightOwlAttributes>.activities {
          await activity.update(ActivityContent(state: state, staleDate: Date().addingTimeInterval(staleAfter)))
        }
        promise.resolve(nil)
      }
    }

    AsyncFunction("end") { (promise: Promise) in
      guard #available(iOS 16.2, *) else {
        promise.resolve(nil)
        return
      }
      Task {
        for activity in Activity<NightOwlAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .default)
        }
        promise.resolve(nil)
      }
    }
  }
}
