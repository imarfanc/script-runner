import Foundation

func debug(_ message: String) {
    print("[debug] \(message)")
    fflush(stdout)
}
