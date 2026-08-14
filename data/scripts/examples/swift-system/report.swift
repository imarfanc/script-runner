import Foundation

let process = ProcessInfo.processInfo
let uptime = Int(process.systemUptime)
let values = [
    ("Host", process.hostName),
    ("Operating system", process.operatingSystemVersionString),
    ("Processors", String(process.processorCount)),
    ("Active processors", String(process.activeProcessorCount)),
    ("Uptime", "\(uptime) seconds"),
]

print("\u{001B}[1;31mSwift system report\u{001B}[0m")
for (label, value) in values {
    print(label.padding(toLength: 20, withPad: " ", startingAt: 0) + value)
}
