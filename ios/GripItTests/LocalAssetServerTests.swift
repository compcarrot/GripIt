import WebKit
import XCTest

@testable import GripIt

final class LocalAssetServerTests: XCTestCase {
  func testServesBundledContentWasmAndHeadAndRejectsTraversal() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    try Data("offline studio".utf8).write(to: root.appendingPathComponent("index.html"))
    try Data([0, 97, 115, 109]).write(to: root.appendingPathComponent("detector.wasm"))
    let server = LocalAssetServer(root: root)
    defer {
      server.stop()
      try? FileManager.default.removeItem(at: root)
    }
    let base = try await withCheckedThrowingContinuation { continuation in
      server.start(port: .any) { continuation.resume(with: $0) }
    }
    let (html, response) = try await URLSession.shared.data(from: base)
    XCTAssertEqual(String(decoding: html, as: UTF8.self), "offline studio")
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    let (_, wasm) = try await URLSession.shared.data(
      from: base.appendingPathComponent("detector.wasm"))
    XCTAssertEqual(wasm.mimeType, "application/wasm")
    var head = URLRequest(url: base)
    head.httpMethod = "HEAD"
    let (empty, headResponse) = try await URLSession.shared.data(for: head)
    XCTAssertTrue(empty.isEmpty)
    XCTAssertEqual(
      (headResponse as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Length"), "14")
    let (_, missing) = try await URLSession.shared.data(
      from: base.appendingPathComponent("missing.js"))
    XCTAssertEqual((missing as? HTTPURLResponse)?.statusCode, 404)
    // Encoded separators bypass URLSession's own normalization and reach the server guard.
    let (_, traversal) = try await URLSession.shared.data(
      from: URL(string: base.absoluteString + "%2e%2e%2fsecret")!)
    XCTAssertEqual((traversal as? HTTPURLResponse)?.statusCode, 403)
  }
  @MainActor func testBundledStudioAndOfflineHandDetectorLoadInWebKit() async throws {
    let root = try XCTUnwrap(Bundle.main.url(forResource: "Web", withExtension: nil))
    let server = LocalAssetServer(root: root)
    defer { server.stop() }
    let base: URL = try await withCheckedThrowingContinuation { continuation in
      server.start(port: .any) { continuation.resume(with: $0) }
    }
    let model = StudioModel()
    let coordinator = StudioWebView.Coordinator(model: model, origin: base)
    let configuration = WKWebViewConfiguration()
    configuration.userContentController.add(coordinator, name: "gripit")
    let view = WKWebView(
      frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: configuration)
    view.navigationDelegate = coordinator
    defer { configuration.userContentController.removeScriptMessageHandler(forName: "gripit") }
    let controller = UIViewController()
    controller.view.addSubview(view)
    let window = UIWindow(frame: view.frame)
    window.rootViewController = controller
    window.makeKeyAndVisible()
    defer { window.isHidden = true }
    view.load(URLRequest(url: base))
    var loaded = false
    for _ in 0..<150 {
      if let ready = try? await view.evaluateJavaScript(
        "document.body?.innerText.includes('Great pitches start') && !!document.querySelector('canvas')"
      ), ready as? Bool == true {
        loaded = true
        break
      }
      try await Task.sleep(nanoseconds: 100_000_000)
    }
    XCTAssertTrue(
      loaded, "The bundled React studio and 3D canvas should load without remote hosting")
    _ = try await view.evaluateJavaScript(
      "window.webkit.messageHandlers.gripit.postMessage({ action: 'export', filename: 'gripit-integration-test.json', content: '{\"pitch\":\"slider\"}' }); true"
    )
    for _ in 0..<30 {
      if model.export != nil { break }
      try await Task.sleep(nanoseconds: 100_000_000)
    }
    let export = try XCTUnwrap(model.export)
    XCTAssertEqual(try String(contentsOf: export.url, encoding: .utf8), "{\"pitch\":\"slider\"}")
    try FileManager.default.removeItem(at: export.url)

    // Exercise the user-facing Rapsodo flow through the bundled React UI and
    // verify that saving reaches the real Swift bridge, not a browser blob URL.
    model.export = nil
    _ = try await view.evaluateJavaScript(
      "document.querySelector('[data-testid=record-throws]').click(); true")
    let enteredSession = try await waitFor(
      "!document.querySelector('.throw-session').closest('[hidden]')", in: view)
    XCTAssertTrue(enteredSession)
    _ = try await view.evaluateJavaScript(
      "document.querySelector('[data-testid=review-session]').click(); true")
    let invalidInputsShown = try await waitFor(
      "document.querySelectorAll('.throw-session [aria-invalid=true]').length === 5", in: view)
    XCTAssertTrue(invalidInputsShown, "An empty throw must not pass validation")
    XCTAssertNil(model.export)
    _ = try await view.evaluateJavaScript(
      "document.querySelector('[data-testid=load-sample-session]').click(); true")
    let sampleLoaded = try await waitFor(
      "document.querySelector('#throw-3-velocity_mph')?.value === '77'", in: view)
    XCTAssertTrue(sampleLoaded)
    _ = try await view.evaluateJavaScript(
      "document.querySelector('[data-testid=review-session]').click(); true")
    let reviewedSession = try await waitFor(
      "!!document.querySelector('[data-testid=save-session]')", in: view)
    XCTAssertTrue(reviewedSession)
    _ = try await view.evaluateJavaScript(
      "document.querySelector('[data-testid=save-session]').click(); true")
    for _ in 0..<30 {
      if model.export != nil { break }
      try await Task.sleep(nanoseconds: 100_000_000)
    }
    let sessionExport = try XCTUnwrap(model.export)
    let sessionData = try Data(contentsOf: sessionExport.url)
    let session = try XCTUnwrap(JSONSerialization.jsonObject(with: sessionData) as? [String: Any])
    XCTAssertEqual(session["source"] as? String, "synthetic_demo")
    XCTAssertEqual(session["pitch"] as? String, "four-seam")
    let recordedThrows = try XCTUnwrap(session["throws"] as? [[String: Any]])
    XCTAssertEqual(recordedThrows.count, 3)
    XCTAssertEqual(recordedThrows[0]["spin_axis_deg"] as? Double, 15)
    XCTAssertEqual(recordedThrows[0]["spin_rate_rpm"] as? Int, 2100)
    try FileManager.default.removeItem(at: sessionExport.url)

    let js = """
      return await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('mediapipe/scan-worker.js', location.href));
        const timer = setTimeout(() => { worker.terminate(); reject(new Error('Offline detector timeout')); }, 45000);
        worker.onmessage = async ({data}) => {
          if (data.error) { clearTimeout(timer); worker.terminate(); reject(new Error(data.error)); return; }
          if (data.ready) {
            const canvas = new OffscreenCanvas(640, 480);
            canvas.getContext('2d').fillRect(0, 0, 640, 480);
            const bitmap = await createImageBitmap(canvas);
            worker.postMessage({ type: 'frame', id: 2, bitmap, timestamp: performance.now() }, [bitmap]);
          } else {
            clearTimeout(timer); worker.terminate();
            resolve(Array.isArray(data.result?.landmarks) && data.result.landmarks.length === 0);
          }
        };
        worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('Worker failed')); };
        worker.postMessage({type: 'init', id: 1, baseUrl: location.href});
      });
      """
    let ready = try await view.callAsyncJavaScript(js, in: nil, contentWorld: .page)
    XCTAssertEqual(
      ready as? Bool, true, "Bundled MediaPipe should initialize and process a frame on iOS")
  }

  @MainActor private func waitFor(_ expression: String, in view: WKWebView) async throws -> Bool {
    for _ in 0..<50 {
      if let value = try? await view.evaluateJavaScript(expression), value as? Bool == true {
        return true
      }
      try await Task.sleep(nanoseconds: 100_000_000)
    }
    return false
  }

}
