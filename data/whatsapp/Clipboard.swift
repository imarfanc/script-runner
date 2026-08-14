import AppKit
import Foundation

func withClipboardRestore(action: () throws -> Void) throws {
    let pasteboard = NSPasteboard.general
    let previousItems = pasteboard.pasteboardItems?.compactMap { item -> NSPasteboardItem? in
        let copy = NSPasteboardItem()
        var copied = false
        for type in item.types {
            if let data = item.data(forType: type) {
                copy.setData(data, forType: type)
                copied = true
            }
        }
        return copied ? copy : nil
    }

    do {
        try action()
    } catch {
        pasteboard.clearContents()
        if let previousItems, !previousItems.isEmpty {
            pasteboard.writeObjects(previousItems)
        }
        throw error
    }

    pasteboard.clearContents()
    if let previousItems, !previousItems.isEmpty {
        pasteboard.writeObjects(previousItems)
    }
}

func withClipboardText(_ text: String, action: () throws -> Void) throws {
    debug("clipboard text chars=\(text.count)")
    try withClipboardRestore {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
        try action()
    }
}

func withClipboardFile(_ path: String, action: () throws -> Void) throws {
    debug("clipboard file \(path)")
    try withClipboardRestore {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.writeObjects([URL(fileURLWithPath: path) as NSURL])
        try action()
    }
}

func pasteText(_ text: String) throws {
    try withClipboardText(text) {
        key(9, flags: .maskCommand)  // Cmd-V
    }
}

func pasteFile(_ path: String) throws {
    try withClipboardFile(path) {
        key(9, flags: .maskCommand)  // Cmd-V
    }
}

func pressReturn() {
    key(36)  // Return
}
