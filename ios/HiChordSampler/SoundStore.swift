import Foundation
import WebKit

/// Keeps the HiChord sounds the page samples, and a copy of your projects and own sounds,
/// as files in the app's own storage (Application Support).
///
/// The page's own storage (IndexedDB) belongs to the website it was loaded from and WebKit may clear it;
/// these files stay through app updates and are only removed when the app is deleted. The page sends
/// each sound as base64 ("HCS1" + header + 16-bit PCM) and gets it back the same way.
///
///   {cmd:"put", key, data}  -> "ok"
///   {cmd:"get", key}        -> base64 or nil
///   {cmd:"list"}            -> [key]           (HiChord sounds: "hc" + preset)
///   {cmd:"list", prefix}    -> [key]           (keys starting with prefix, e.g. "p:" projects, "s:" own sounds)
///
/// Projects are mirrored here because the page's storage belongs to the site it came from: when the app starts
/// offline it falls back to its bundled copy (another origin, empty storage) and reads the projects from here.
///   {cmd:"delete", key}     -> "ok"
final class SoundStore: NSObject, WKScriptMessageHandlerWithReply {
    private let queue = DispatchQueue(label: "sound-store")

    private var folder: URL? {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let dir = base.appendingPathComponent("HiChordSounds", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    /// Only the page's own names: "hc" + preset (HiChord sounds), "p:<id>" (project), "s:<id>:<layer>" (own sound),
    /// "v:<id>" (a vocal take), "x:<id>" (a deleted project) and "last" (the project open last).
    private static let keyPattern = "^(hc[0-9]{1,3}|p:[A-Za-z0-9]{1,40}|x:[A-Za-z0-9]{1,40}|s:[A-Za-z0-9]{1,40}:[0-9]{1,3}|v:[A-Za-z0-9]{1,40}|last)$"
    private func file(_ key: Any?) -> URL? {
        guard let key = key as? String, key.range(of: Self.keyPattern, options: .regularExpression) != nil else { return nil }
        return folder?.appendingPathComponent(key.replacingOccurrences(of: ":", with: "~") + ".hcs")
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
                let keys = names.filter { $0.hasSuffix(".hcs") }.map { String($0.dropLast(4)).replacingOccurrences(of: "~", with: ":") }
                if let prefix = body["prefix"] as? String { result = keys.filter { $0.hasPrefix(prefix) } }
                else { result = keys.filter { $0.hasPrefix("hc") } }
            case "delete":
                if let url = self.file(key) { try? FileManager.default.removeItem(at: url); result = "ok" }
            default:
                error = "unknown command"
            }
            DispatchQueue.main.async { replyHandler(result, error) }
        }
    }
}
