import AVFoundation
import WebKit

/// Decides where the app's sound goes.
///
/// With MIDI OUT on DAW (its default), the HiChord is also a USB audio device. iOS then routes the
/// app's sound to the HiChord's USB port, where nothing plays it, so you hear nothing at all.
/// Unless the page asks for USB output, sound is sent to the iPhone speaker whenever a USB audio
/// device is connected. Headphones and Bluetooth are left alone.
final class AudioRouter: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    private var allowUSBOutput = false
    private var forcedSpeaker = false

    func start() {
        let s = AVAudioSession.sharedInstance()
        do {
            try s.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothA2DP])
            try s.setActive(true)
        } catch {
            print("[audio] session error: \(error)")
        }
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged(_:)),
                                               name: AVAudioSession.routeChangeNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)),
                                               name: AVAudioSession.interruptionNotification, object: nil)
        apply()
    }

    private var usbConnected: Bool {
        let s = AVAudioSession.sharedInstance()
        let inOutputs = s.currentRoute.outputs.contains { $0.portType == .usbAudio }
        let inInputs = (s.availableInputs ?? []).contains { $0.portType == .usbAudio }
        return inOutputs || inInputs
    }

    private var otherOutput: Bool {   // headphones, AirPods, AirPlay: never override those
        let other: Set<AVAudioSession.Port> = [.headphones, .bluetoothA2DP, .bluetoothLE, .bluetoothHFP, .airPlay, .carAudio, .HDMI]
        return AVAudioSession.sharedInstance().currentRoute.outputs.contains { other.contains($0.portType) }
    }

    func apply() {
        let s = AVAudioSession.sharedInstance()
        let wantSpeaker = usbConnected && !allowUSBOutput && !otherOutput
        if wantSpeaker != forcedSpeaker {
            do {
                try s.overrideOutputAudioPort(wantSpeaker ? .speaker : .none)
                forcedSpeaker = wantSpeaker
            } catch {
                print("[audio] override failed: \(error)")
            }
        }
        report()
    }

    @objc private func routeChanged(_ note: Notification) {
        DispatchQueue.main.async { self.apply() }
    }

    @objc private func interrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        DispatchQueue.main.async {
            self.apply()
            self.webView?.evaluateJavaScript("window.__nativeAudio&&window.__nativeAudio.resume()", completionHandler: nil)
        }
    }

    /// Tell the page (and the log) where sound goes now.
    func report() {
        let r = AVAudioSession.sharedInstance().currentRoute
        let outs = r.outputs.map { ["type": $0.portType.rawValue, "name": $0.portName] }
        let ins = r.inputs.map { ["type": $0.portType.rawValue, "name": $0.portName] }
        let info: [String: Any] = ["outputs": outs, "inputs": ins, "usb": usbConnected,
                                   "forcedSpeaker": forcedSpeaker, "allowUSB": allowUSBOutput]
        print("[audio] out: \(r.outputs.map { "\($0.portName) (\($0.portType.rawValue))" }) in: \(r.inputs.map { $0.portName }) usb: \(usbConnected) speakerForced: \(forcedSpeaker)")
        guard let data = try? JSONSerialization.data(withJSONObject: info),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.__nativeAudio&&window.__nativeAudio.route(\(json))", completionHandler: nil)
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        switch cmd {
        case "route":
            report()
        case "usbOutput":
            allowUSBOutput = (body["on"] as? Bool) ?? false
            apply()
        default:
            break
        }
    }
}
