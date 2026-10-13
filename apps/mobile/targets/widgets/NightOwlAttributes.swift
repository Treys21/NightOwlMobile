// Keep in sync with modules/nightowl-live-activity/ios/NightOwlAttributes.swift: ActivityKit
// matches the app's and the widget's attributes by type name and shape.
import ActivityKit
import Foundation

struct NightOwlAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var winningLeaguesCount: Int
    var totalActiveLeagues: Int
    var netPortfolioPointsToday: Double
    var latestPlayHeadline: String
    var latestPlayDeltaText: String
    var isPositivePlay: Bool
    var updatedAtEpoch: Int
    var closestMatchups: [String]
  }

  var sleeperUsername: String
  var nflWeek: Int
}
