import Foundation
import WebKit

/// Keeps the HiChord sounds the page samples, as files in the app's own storage (Application Support).
///
/// The page's own storage (IndexedDB) belongs to the website it was loaded from and WebKit may clear it;
/// these files stay through app updates and are only removed when the app is deleted. The page sends
/// each sound as base64 ("HCS1" + header + 16-bit PCM) and gets it back the same way.
///
///   {cmd:"put", key, data}  -> "ok"
///   {cmd:"get", key}        -> base64 or nil
///   {cmd:"list"}            -> [key]
///   {cmd:"delete", key}     -> "ok"
final class SoundStore: NSObject, WKScriptMessageHandlerWithReply {
    private let queue = DispatchQueue(label: "sound-store")

    private var folder: URL? {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let dir = base.appendingPathComponent("HiChordSounds", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Only the page's own sound names: "hc" and a preset number.
    private func file(_ key: Any?) -> URL? {
        guard let key = key as? String, key.range(of: "^hc[0-9]{1,3}$", options: .regularExpression) != nil else { return nil }
        return folder?.appendingPathComponent(key + ".hcs")
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame,
              let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else {
            replyHandler(nil, "bad request"); return
        }
        let key = body["key"], data = body["data"] as? String
        queue.async {
            var result: Any? = nil, error: String? = nil
            switch cmd {
            case "put":
                if let url = self.file(key), let d = data.flatMap({ Data(base64Encoded: $0) }) {
                    do { try d.write(to: url, options: .atomic); result = "ok" } catch let e { error = e.localizedDescription }
                } else { error = "bad put" }
            case "get":
                if let url = self.file(key), let d = try? Data(contentsOf: url) { result = d.base64EncodedString() }
            case "list":
                let names = (try? FileManager.default.contentsOfDirectory(atPath: self.folder?.path ?? "")) ?? []
                result = names.filter { $0.hasSuffix(".hcs") }.map { String($0.dropLast(4)) }
            case "delete":
                if let url = self.file(key) { try? FileManager.default.removeItem(at: url); result = "ok" }
            default:
                error = "unknown command"
            }
            DispatchQueue.main.async { replyHandler(result, error) }
        }
    }
}
