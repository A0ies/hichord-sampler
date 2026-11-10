import CoreMIDI
import Foundation
import WebKit

/// Bridges CoreMIDI to the Web MIDI polyfill in midi-shim.js.
/// Every source is connected to one input port; ports are identified by their CoreMIDI unique ID.
final class MIDIBridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?

    private var client = MIDIClientRef()
    private var inPort = MIDIPortRef()
    private var outPort = MIDIPortRef()
    private var connected = Set<MIDIUniqueID>()
    private var started = false

    func start() {
        guard !started else { return }
        started = true
        MIDIClientCreateWithBlock("HiChord Sampler" as CFString, &client) { [weak self] note in
            if note.pointee.messageID == .msgSetupChanged {
                DispatchQueue.main.async { self?.refresh() }
            }
        }
        MIDIInputPortCreateWithBlock(client, "HiChord Sampler In" as CFString, &inPort) { [weak self] list, refCon in
            guard let self = self, let refCon = refCon else { return }
            let uid = MIDIUniqueID(truncatingIfNeeded: Int(bitPattern: refCon) & 0xFFFF_FFFF)
            var bytes: [UInt8] = []
            for packet in list.unsafeSequence() {
                let len = Int(packet.pointee.length)
                let base = UnsafeRawPointer(packet) + MemoryLayout<MIDIPacket>.offset(of: \MIDIPacket.data)!
                bytes.append(contentsOf: UnsafeRawBufferPointer(start: base, count: len))
            }
            guard !bytes.isEmpty else { return }
            let js = "window.__nativeMIDI&&window.__nativeMIDI.receive('\(uid)',[\(bytes.map(String.init).joined(separator: ","))])"
            DispatchQueue.main.async { self.webView?.evaluateJavaScript(js, completionHandler: nil) }
        }
        MIDIOutputPortCreate(client, "HiChord Sampler Out" as CFString, &outPort)
        refresh()
    }

    private func uniqueID(_ obj: MIDIObjectRef) -> MIDIUniqueID {
        var uid: MIDIUniqueID = 0
        MIDIObjectGetIntegerProperty(obj, kMIDIPropertyUniqueID, &uid)
        return uid
    }

    private func string(_ obj: MIDIObjectRef, _ prop: CFString) -> String {
        var s: Unmanaged<CFString>?
        if MIDIObjectGetStringProperty(obj, prop, &s) == noErr, let v = s?.takeRetainedValue() { return v as String }
        return ""
    }

    private func describe(_ obj: MIDIObjectRef) -> [String: String] {
        var name = string(obj, kMIDIPropertyDisplayName)
        if name.isEmpty { name = string(obj, kMIDIPropertyName) }
        return ["id": String(uniqueID(obj)), "name": name, "manufacturer": string(obj, kMIDIPropertyManufacturer)]
    }

    /// Connect new sources and tell the page which ports exist.
    func refresh() {
        var inputs: [[String: String]] = []
        var outputs: [[String: String]] = []
        var present = Set<MIDIUniqueID>()
        for i in 0..<MIDIGetNumberOfSources() {
            let src = MIDIGetSource(i)
            let uid = uniqueID(src)
            present.insert(uid)
            if !connected.contains(uid) {
                let ref = UnsafeMutableRawPointer(bitPattern: (Int(UInt32(bitPattern: uid)) | 0x1_0000_0000))
                if MIDIPortConnectSource(inPort, src, ref) == noErr { connected.insert(uid) }
            }
            inputs.append(describe(src))
        }
        connected = connected.intersection(present)
        for i in 0..<MIDIGetNumberOfDestinations() {
            outputs.append(describe(MIDIGetDestination(i)))
        }
        let payload: [String: Any] = ["inputs": inputs, "outputs": outputs]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.__nativeMIDI&&window.__nativeMIDI.setPorts(\(json))", completionHandler: nil)
    }

    private func destination(for id: String) -> MIDIEndpointRef? {
        guard let want = MIDIUniqueID(id) else { return nil }
        for i in 0..<MIDIGetNumberOfDestinations() {
            let d = MIDIGetDestination(i)
            if uniqueID(d) == want { return d }
        }
        return nil
    }

    private func send(_ bytes: [UInt8], to dest: MIDIEndpointRef) {
        let size = MemoryLayout<MIDIPacketList>.size + bytes.count + 64
        let buffer = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: MemoryLayout<MIDIPacketList>.alignment)
        defer { buffer.deallocate() }
        let list = buffer.bindMemory(to: MIDIPacketList.self, capacity: 1)
        var packet = MIDIPacketListInit(list)
        packet = MIDIPacketListAdd(list, size, packet, 0, bytes.count, bytes)
        MIDISend(outPort, dest, list)
    }

    // MARK: WKScriptMessageHandler
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "log":
            print("[web \(body["level"] as? String ?? "log")] \(body["text"] as? String ?? "")")
        case "init":
            print("[midi] init: \(MIDIGetNumberOfSources()) sources, \(MIDIGetNumberOfDestinations()) destinations")
            start()
            refresh()
        case "send":
            guard let id = body["id"] as? String, let raw = body["data"] as? [NSNumber],
                  let dest = destination(for: id) else { return }
            send(raw.map { UInt8(truncatingIfNeeded: $0.intValue) }, to: dest)
        default:
            break
        }
    }
}
