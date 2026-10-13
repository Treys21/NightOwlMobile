import ActivityKit
import SwiftUI
import WidgetKit

private let night950 = Color(red: 7 / 255, green: 10 / 255, blue: 16 / 255)
private let night300 = Color(red: 163 / 255, green: 177 / 255, blue: 198 / 255)
private let positive = Color(red: 34 / 255, green: 197 / 255, blue: 94 / 255)
private let negative = Color(red: 239 / 255, green: 68 / 255, blue: 68 / 255)
private let cyan = Color(red: 56 / 255, green: 189 / 255, blue: 248 / 255)

private extension NightOwlAttributes.ContentState {
  var deltaColor: Color { isPositivePlay ? positive : negative }
  var record: String { "\(winningLeaguesCount)/\(totalActiveLeagues)" }
  var netText: String {
    let sign = netPortfolioPointsToday >= 0 ? "+" : "−"
    return "\(sign)\(String(format: "%.1f", abs(netPortfolioPointsToday))) today"
  }
}

/// "+7.4 pts" in a tinted capsule.
private struct DeltaPill: View {
  let state: NightOwlAttributes.ContentState

  var body: some View {
    Text(state.latestPlayDeltaText)
      .font(.system(size: 13, weight: .bold).monospacedDigit())
      .foregroundStyle(state.deltaColor)
      .padding(.horizontal, 8)
      .padding(.vertical, 3)
      .background(state.deltaColor.opacity(0.18), in: Capsule())
  }
}

private struct OwlMark: View {
  var size: CGFloat = 14

  var body: some View {
    Image(systemName: "moon.stars.fill")
      .font(.system(size: size, weight: .semibold))
      .foregroundStyle(cyan)
  }
}

/// Lock Screen and notification banner.
private struct LockScreenView: View {
  let context: ActivityViewContext<NightOwlAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 6) {
        OwlMark()
        Text("Week \(context.attributes.nflWeek) • Leading in \(context.state.winningLeaguesCount)/\(context.state.totalActiveLeagues) Leagues")
          .font(.system(size: 14, weight: .semibold))
          .foregroundStyle(.white)
          .lineLimit(1)
        Spacer(minLength: 4)
        Text(context.state.netText)
          .font(.system(size: 12, weight: .semibold).monospacedDigit())
          .foregroundStyle(night300)
      }
      HStack(alignment: .top, spacing: 8) {
        Text(context.state.latestPlayHeadline)
          .font(.system(size: 13))
          .foregroundStyle(.white.opacity(0.92))
          .lineLimit(2)
          .frame(maxWidth: .infinity, alignment: .leading)
        DeltaPill(state: context.state)
      }
    }
    .padding(14)
    .activityBackgroundTint(night950)
    .activitySystemActionForegroundColor(cyan)
  }
}

struct NightOwlLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: NightOwlAttributes.self) { context in
      LockScreenView(context: context)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            OwlMark(size: 16)
            Text(context.state.record)
              .font(.system(size: 16, weight: .bold).monospacedDigit())
              .foregroundStyle(.white)
            Text("W")
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(night300)
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          DeltaPill(state: context.state)
        }
        DynamicIslandExpandedRegion(.center) {
          Text("Week \(context.attributes.nflWeek)")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(night300)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            Text(context.state.latestPlayHeadline)
              .font(.system(size: 13))
              .foregroundStyle(.white)
              .lineLimit(2)
            ForEach(context.state.closestMatchups.prefix(2), id: \.self) { line in
              Text(line)
                .font(.system(size: 12, weight: .medium).monospacedDigit())
                .foregroundStyle(night300)
                .lineLimit(1)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.top, 4)
        }
      } compactLeading: {
        HStack(spacing: 4) {
          OwlMark(size: 12)
          Text("\(context.state.record) W")
            .font(.system(size: 13, weight: .semibold).monospacedDigit())
            .foregroundStyle(.white)
        }
      } compactTrailing: {
        Text(context.state.latestPlayDeltaText)
          .font(.system(size: 13, weight: .bold).monospacedDigit())
          .foregroundStyle(context.state.deltaColor)
      } minimal: {
        OwlMark(size: 12)
      }
      .keylineTint(cyan)
    }
  }
}
