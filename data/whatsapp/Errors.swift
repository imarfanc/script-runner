import ApplicationServices
import Foundation

struct Payload: Decodable {
    let chat: String
    let message: String
    let file: String?
}

enum WhatsAppError: Error, CustomStringConvertible {
    case usage
    case invalidPayload(String)
    case missingFile(String)
    case notRunning
    case noWindow
    case missingChatList
    case missingComposer
    case chatNotFound(String)
    case chatDidNotSwitch(String)
    case refusedToSend(String)
    case accessibilityActionFailed(String, AXError)
    case couldNotLoadImage(String)

    var description: String {
        switch self {
        case .usage:
            return "Usage: send <payload.json>"
        case .invalidPayload(let detail):
            return "Invalid payload: \(detail)"
        case .missingFile(let path):
            return "Attachment not found: \(path)"
        case .notRunning:
            return "WhatsApp is not running."
        case .noWindow:
            return "WhatsApp did not open a window."
        case .missingChatList:
            return "Could not find the WhatsApp chat list."
        case .missingComposer:
            return "Could not find the WhatsApp message composer."
        case .chatNotFound(let name):
            return "Could not find WhatsApp chat: \(name)"
        case .chatDidNotSwitch(let name):
            return "Clicked \(name), but WhatsApp did not switch to that chat."
        case .refusedToSend(let selected):
            return "Refusing to send: selected chat is \(selected)."
        case .accessibilityActionFailed(let label, let error):
            return "Could not press \(label). Accessibility returned \(error.rawValue)."
        case .couldNotLoadImage(let path):
            return "Could not load image for clipboard: \(path)"
        }
    }
}

func loadPayload(from path: String) throws -> Payload {
    debug("loading payload from \(path)")
    let url = URL(fileURLWithPath: path)
    let data: Data
    do {
        data = try Data(contentsOf: url)
    } catch {
        throw WhatsAppError.invalidPayload("could not read \(path)")
    }

    do {
        let payload = try JSONDecoder().decode(Payload.self, from: data)
        if payload.chat.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw WhatsAppError.invalidPayload("chat is required")
        }
        let file = payload.file?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let message = payload.message
        if message.isEmpty && file.isEmpty {
            throw WhatsAppError.invalidPayload("message or file is required")
        }
        if !file.isEmpty && !FileManager.default.fileExists(atPath: file) {
            throw WhatsAppError.missingFile(file)
        }
        debug(
            "payload chat=\(payload.chat) messageChars=\(message.count) file=\(file.isEmpty ? "(none)" : file)"
        )
        return Payload(chat: payload.chat, message: message, file: file.isEmpty ? nil : file)
    } catch let error as WhatsAppError {
        throw error
    } catch {
        throw WhatsAppError.invalidPayload(error.localizedDescription)
    }
}
