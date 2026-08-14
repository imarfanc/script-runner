import ApplicationServices
import Foundation

func attr(_ element: AXUIElement, _ name: CFString) -> AnyObject? {
    var value: AnyObject?
    let error = AXUIElementCopyAttributeValue(element, name, &value)
    return error == .success ? value : nil
}

func normalize(_ value: String?) -> String {
    (value ?? "").replacingOccurrences(of: "\u{200E}", with: "").trimmingCharacters(
        in: .whitespacesAndNewlines)
}

func children(of element: AXUIElement) -> [AXUIElement] {
    attr(element, kAXChildrenAttribute as CFString) as? [AXUIElement] ?? []
}

func stringAttr(_ element: AXUIElement, _ name: CFString) -> String? {
    attr(element, name) as? String
}

func identifier(of element: AXUIElement) -> String? {
    stringAttr(element, "AXIdentifier" as CFString)
}

func role(of element: AXUIElement) -> String? {
    stringAttr(element, kAXRoleAttribute as CFString)
}

func description(of element: AXUIElement) -> String? {
    stringAttr(element, kAXDescriptionAttribute as CFString)
}

func findFirst(
    in root: AXUIElement, maxNodes: Int = 500, matching predicate: (AXUIElement) -> Bool
) -> AXUIElement? {
    var queue = [root]
    var seen = 0

    while !queue.isEmpty && seen < maxNodes {
        let element = queue.removeFirst()
        seen += 1

        if predicate(element) {
            return element
        }

        queue.append(contentsOf: children(of: element))
    }

    return nil
}

func findById(in root: AXUIElement, _ targetId: String) -> AXUIElement? {
    findFirst(in: root) { identifier(of: $0) == targetId }
}

func press(_ element: AXUIElement, label: String) throws {
    debug("press \(label)")
    let error: AXError = AXUIElementPerformAction(element, kAXPressAction as CFString)
    if error != AXError.success {
        throw WhatsAppError.accessibilityActionFailed(label, error)
    }
}

func key(_ keyCode: CGKeyCode, flags: CGEventFlags = []) {
    debug("key code=\(keyCode) flags=\(flags.rawValue)")
    let down = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true)
    down?.flags = flags
    down?.post(tap: .cghidEventTap)

    let up = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false)
    up?.flags = flags
    up?.post(tap: .cghidEventTap)
}
