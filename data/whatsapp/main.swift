import AppKit
import Foundation

do {
    guard CommandLine.arguments.count >= 2 else {
        throw WhatsAppError.usage
    }

    debug("send starting argv=\(CommandLine.arguments)")
    let payload = try loadPayload(from: CommandLine.arguments[1])
    let chatName = payload.chat
    let message = payload.message
    let file = payload.file

    if let file {
        print("Sending WhatsApp message to \(chatName) with attachment \(file)")
    } else {
        print("Sending WhatsApp message to \(chatName)")
    }

    try openWhatsApp()

    let app = try waitForWhatsApp()
    debug("activating WhatsApp")
    app.activate()

    var window = try frontWindow(for: app)
    window = try selectChat(window, named: chatName)

    let selectedChat = currentChatName(in: window)
    debug("verified chat=\(selectedChat)")
    guard selectedChat == chatName else {
        throw WhatsAppError.refusedToSend(selectedChat)
    }

    try focusComposer(in: window)

    if let file {
        debug("pasting attachment")
        try pasteAttachment(file)
        Thread.sleep(forTimeInterval: 1.0)
        if !message.isEmpty {
            debug("pasting caption")
            try pasteText(message)
            Thread.sleep(forTimeInterval: 0.1)
        }
        debug("pressing return to send attachment")
        pressReturn()
    } else {
        debug("pasting text-only message")
        try withClipboardText(message) {
            key(9, flags: .maskCommand)  // Cmd-V
            Thread.sleep(forTimeInterval: 0.05)
            pressReturn()
        }
    }

    print("Sent.")
    debug("send finished")
} catch {
    fputs("Error: \(error)\n", stderr)
    exit(1)
}
