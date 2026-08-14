import AppKit
import ApplicationServices
import Foundation

func run(_ path: String, _ arguments: [String]) throws {
    debug("run \(path) \(arguments.joined(separator: " "))")
    let process = Process()
    process.executableURL = URL(fileURLWithPath: path)
    process.arguments = arguments
    try process.run()
    process.waitUntilExit()
    if process.terminationStatus != 0 {
        throw NSError(
            domain: "CommandFailed",
            code: Int(process.terminationStatus),
            userInfo: [
                NSLocalizedDescriptionKey: "\(path) \(arguments.joined(separator: " ")) failed."
            ]
        )
    }
}

func runningWhatsApp() -> NSRunningApplication? {
    NSRunningApplication.runningApplications(withBundleIdentifier: "net.whatsapp.WhatsApp").first
}

func openWhatsApp() throws {
    debug("opening WhatsApp")
    try run("/usr/bin/open", ["-a", "WhatsApp"])
}

func waitForWhatsApp() throws -> NSRunningApplication {
    debug("waiting for WhatsApp process")
    for attempt in 0..<30 {
        if let app = runningWhatsApp() {
            debug("WhatsApp pid=\(app.processIdentifier) after \(attempt) polls")
            return app
        }
        Thread.sleep(forTimeInterval: 0.1)
    }

    throw WhatsAppError.notRunning
}

func frontWindow(for app: NSRunningApplication) throws -> AXUIElement {
    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    debug("waiting for WhatsApp window")

    for attempt in 0..<30 {
        if let windows = attr(axApp, kAXWindowsAttribute as CFString) as? [AXUIElement],
            let window = windows.first
        {
            debug("got window after \(attempt) polls")
            return window
        }
        Thread.sleep(forTimeInterval: 0.1)
    }

    throw WhatsAppError.noWindow
}

func snapshot(_ window: AXUIElement) -> (
    header: AXUIElement?, chatList: AXUIElement?, composer: AXUIElement?
) {
    (
        findById(in: window, "NavigationBar_HeaderViewButton"),
        findById(in: window, "ChatListView_TableView"),
        findById(in: window, "ChatBar_ComposerTextView")
    )
}

func currentChatName(in window: AXUIElement) -> String {
    guard let header = snapshot(window).header else { return "" }
    return normalize(description(of: header))
}

func findChat(in chatList: AXUIElement, named name: String) -> AXUIElement? {
    let target = normalize(name)
    let matches = children(of: chatList).filter { normalize(description(of: $0)) == target }
    return matches.first { role(of: $0) == kAXButtonRole as String } ?? matches.first
}

func searchForChat(_ name: String) throws {
    debug("searching for chat \(name)")
    try withClipboardText(name) {
        key(3, flags: .maskCommand)  // Cmd-F
        Thread.sleep(forTimeInterval: 0.05)
        key(0, flags: .maskCommand)  // Cmd-A
        key(9, flags: .maskCommand)  // Cmd-V
    }
}

func selectChat(_ window: AXUIElement, named name: String) throws -> AXUIElement {
    let already = currentChatName(in: window)
    debug("current chat=\(already.isEmpty ? "(none)" : already) target=\(name)")
    if already == name {
        return window
    }

    guard var chatList = snapshot(window).chatList else {
        throw WhatsAppError.missingChatList
    }

    var chat = findChat(in: chatList, named: name)
    if chat == nil {
        debug("chat not visible; searching")
        try searchForChat(name)
        let app = try waitForWhatsApp()
        let refreshedWindow = try frontWindow(for: app)
        guard let refreshedChatList = snapshot(refreshedWindow).chatList else {
            throw WhatsAppError.missingChatList
        }
        chatList = refreshedChatList
        chat = findChat(in: chatList, named: name)
    }

    guard let chat else {
        throw WhatsAppError.chatNotFound(name)
    }

    try press(chat, label: name)

    for attempt in 0..<20 {
        let app = try waitForWhatsApp()
        let refreshedWindow = try frontWindow(for: app)
        let selected = currentChatName(in: refreshedWindow)
        debug("switch poll \(attempt): \(selected)")
        if selected == name {
            return refreshedWindow
        }
        Thread.sleep(forTimeInterval: 0.1)
    }

    throw WhatsAppError.chatDidNotSwitch(name)
}

func focusComposer(in window: AXUIElement) throws {
    debug("focusing composer")
    guard let composer = snapshot(window).composer else {
        throw WhatsAppError.missingComposer
    }

    AXUIElementSetAttributeValue(composer, kAXFocusedAttribute as CFString, kCFBooleanTrue)
    try press(composer, label: "message composer")
}
