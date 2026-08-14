import AppKit
import Foundation

private let imageExtensions: Set<String> = [
    "jpg", "jpeg", "png", "gif", "webp", "tiff", "tif", "heic", "bmp",
]

func withClipboardRestore(hold: TimeInterval = 0.25, action: () throws -> Void) throws {
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
        if hold > 0 {
            Thread.sleep(forTimeInterval: hold)
        }
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

func withClipboardImage(_ path: String, action: () throws -> Void) throws {
    guard let image = NSImage(contentsOfFile: path) else {
        throw WhatsAppError.couldNotLoadImage(path)
    }
    debug("clipboard image \(path) size=\(Int(image.size.width))x\(Int(image.size.height))")
    try withClipboardRestore(hold: 0.5) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        // WhatsApp expects image bitmap data, not a file URL / path string.
        if !pasteboard.writeObjects([image]) {
            throw WhatsAppError.couldNotLoadImage(path)
        }
        if let tiff = image.tiffRepresentation {
            pasteboard.setData(tiff, forType: .tiff)
        }
        try action()
    }
}

func withClipboardFile(_ path: String, action: () throws -> Void) throws {
    debug("clipboard file-url \(path)")
    try withClipboardRestore(hold: 0.5) {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        let item = NSPasteboardItem()
        item.setString(URL(fileURLWithPath: path).absoluteString, forType: .fileURL)
        if !pasteboard.writeObjects([item]) {
            throw WhatsAppError.missingFile(path)
        }
        try action()
    }
}

func pasteText(_ text: String) throws {
    try withClipboardText(text) {
        key(9, flags: .maskCommand)  // Cmd-V
    }
}

func pasteAttachment(_ path: String) throws {
    let ext = (path as NSString).pathExtension.lowercased()
    if imageExtensions.contains(ext) {
        try withClipboardImage(path) {
            key(9, flags: .maskCommand)  // Cmd-V
        }
    } else {
        try withClipboardFile(path) {
            key(9, flags: .maskCommand)  // Cmd-V
        }
    }
}

func pressReturn() {
    key(36)  // Return
}
