/// Desktop Runtime Facade cleanup and lifecycle tests.
part of 'desktop_runtime_facade_test.dart';

void _registerDesktopRuntimeLifecycleTests() {
  test('closed test Runtime rejects another Facade capability call', () async {
    final runtime = PluginRuntime.desktopForTesting(
      runtimeRepositoryRoot: nodeRuntimeRepositoryRoot,
    );
    addTearDown(runtime.debugDispose);

    await runtime.invoke(const RuntimePingInvocation());
    await runtime.debugDispose();

    await expectLater(
      runtime.invoke(const RuntimePingInvocation()),
      throwsA(
        isA<PluginRuntimeException>().having(
          (error) => error.code,
          'code',
          'runtime_unavailable',
        ),
      ),
    );
  });

  test(
    'Facade reports a missing packaged Node executable with a stable reason',
    () async {
      final repositoryRoot = nodeRuntimeRepositoryRoot;
      final runtime = PluginRuntime.desktopForTesting(
        runtimeRepositoryRoot: repositoryRoot,
        nodeExecutableOverride: File(
          <String>[
            repositoryRoot.path,
            'missing-node.exe',
          ].join(Platform.pathSeparator),
        ),
      );
      final diagnostics = <RuntimeDiagnostic>[];
      final subscription = runtime.diagnostics.listen(diagnostics.add);
      addTearDown(() async {
        await subscription.cancel();
        await runtime.debugDispose();
      });

      late PluginRuntimeException error;
      for (var attempt = 0; attempt < 96; attempt += 1) {
        error = await _captureRuntimeFailure(
          runtime.invoke(const RuntimePingInvocation()),
        );
      }
      await Future<void>.delayed(Duration.zero);

      expect(error.code, 'runtime_node_executable_missing');
      expect(
        error.diagnostics.map((diagnostic) => diagnostic.code),
        contains('runtime_node_executable_missing'),
      );
      expect(
        diagnostics.map((diagnostic) => diagnostic.code),
        contains('runtime_node_executable_missing'),
      );
    },
  );

  test(
    'Facade reports a missing packaged main script with a stable reason',
    () async {
      final repositoryRoot = nodeRuntimeRepositoryRoot;
      final runtime = PluginRuntime.desktopForTesting(
        runtimeRepositoryRoot: repositoryRoot,
        entrypointOverride: File(
          <String>[
            repositoryRoot.path,
            'missing-runtime-main.mjs',
          ].join(Platform.pathSeparator),
        ),
      );
      addTearDown(runtime.debugDispose);

      final error = await _captureRuntimeFailure(
        runtime.invoke(const RuntimePingInvocation()),
      );

      expect(error.code, 'runtime_entrypoint_missing');
      expect(
        error.diagnostics.map((diagnostic) => diagnostic.code),
        contains('runtime_entrypoint_missing'),
      );
    },
  );

  test(
    'Facade preserves a structured Node startup failure diagnostic',
    () async {
      final repositoryRoot = nodeRuntimeRepositoryRoot;
      final runtime = PluginRuntime.desktopForTesting(
        runtimeRepositoryRoot: repositoryRoot,
        entrypointOverride: File(
          <String>[
            repositoryRoot.path,
            'test',
            'fixtures',
            'fatal-before-ready.mjs',
          ].join(Platform.pathSeparator),
        ),
      );
      addTearDown(runtime.debugDispose);

      final error = await _captureRuntimeFailure(
        runtime.invoke(const RuntimePingInvocation()),
      );

      expect(error.code, 'runtime_start_failed');
      expect(
        error.diagnostics.map((diagnostic) => diagnostic.code),
        contains('test_startup_failure'),
      );
    },
  );

  test(
    'a child exit before ready becomes a fatal Facade diagnostic and bounded fallback TXT',
    () async {
      final repositoryRoot = nodeRuntimeRepositoryRoot;
      final runtimeDataRoot = await Directory.systemTemp.createTemp(
        'mgread-runtime-preboot-fallback-',
      );
      final runtime = PluginRuntime.desktopForTesting(
        runtimeRepositoryRoot: repositoryRoot,
        runtimeDataRoot: runtimeDataRoot,
        entrypointOverride: File(
          <String>[
            pluginRuntimeRepositoryRoot.path,
            'test',
            'fixtures',
            'exit-before-ready.mjs',
          ].join(Platform.pathSeparator),
        ),
      );
      addTearDown(() async {
        await runtime.debugDispose();
        await runtimeDataRoot.delete(recursive: true);
      });

      final error = await _captureRuntimeFailure(
        runtime.invoke(const RuntimePingInvocation()),
      );
      await Future<void>.delayed(const Duration(milliseconds: 50));
      final fallback = File(
        <String>[
          runtimeDataRoot.path,
          'diagnostics',
          'desktop-fatal-fallback.txt',
        ].join(Platform.pathSeparator),
      );
      final contents = await fallback.readAsString();

      expect(error.code, 'runtime_exited_before_ready');
      expect(
        error.diagnostics
            .singleWhere((item) => item.code == error.code)
            .isFatal,
        isTrue,
      );
      expect(contents, contains('"code":"runtime_exited_before_ready"'));
      expect(contents, contains('"phase":"startup"'));
      expect(contents, contains('"fingerprint":'));
      expect(contents, isNot(contains(runtimeDataRoot.path)));
      expect(contents, isNot(contains('exit-before-ready.mjs')));
      expect((await fallback.length()), lessThanOrEqualTo(16 * 1024));
    },
  );

  test(
    'HTTP readiness body timeout fails once and cleans up the child',
    () async {
      final runtime = PluginRuntime.desktopForTesting(
        runtimeRepositoryRoot: nodeRuntimeRepositoryRoot,
        entrypointOverride: File(
          <String>[
            pluginRuntimeRepositoryRoot.path,
            'test',
            'fixtures',
            'ready-http-body-hang.mjs',
          ].join(Platform.pathSeparator),
        ),
      );
      addTearDown(() async {
        await runtime.debugDispose();
        await runtime.debugDispose();
      });

      final stopwatch = Stopwatch()..start();
      final error = await _captureRuntimeFailure(
        runtime.invoke(const RuntimePingInvocation()),
      );
      stopwatch.stop();

      expect(error.code, 'runtime_not_ready');
      expect(
        error.diagnostics.map((diagnostic) => diagnostic.code),
        contains('runtime_http_readiness_failed'),
      );
      expect(stopwatch.elapsed, lessThan(const Duration(seconds: 25)));
      expect(runtime.debugDesktopProcessStartCount, 1);

      await Future<void>.delayed(const Duration(milliseconds: 100));
      expect(runtime.debugDesktopProcessStartCount, 1);
    },
    timeout: const Timeout(Duration(seconds: 35)),
  );

  test(
    'a post-ready child exit emits a fatal diagnostic and only restarts on the next invocation',
    () async {
      final runtime = PluginRuntime.desktopForTesting(
        runtimeRepositoryRoot: nodeRuntimeRepositoryRoot,
        testExitAfterReady: const Duration(milliseconds: 250),
      );
      final fatalDiagnostics = <RuntimeDiagnostic>[];
      final subscription = runtime.fatalDiagnostics.listen(
        fatalDiagnostics.add,
      );
      addTearDown(() async {
        await subscription.cancel();
        await runtime.debugDispose();
      });

      await runtime.invoke(const RuntimePingInvocation());
      await _waitForDiagnosticCodes(fatalDiagnostics, const <String>[
        'runtime_process_exited',
      ]);
      expect(fatalDiagnostics.single.isFatal, isTrue);
      expect(runtime.debugDesktopProcessStartCount, 1);

      await runtime.invoke(const RuntimePingInvocation());
      expect(runtime.debugDesktopProcessStartCount, 2);
    },
  );

  test(
    'lifecycle restart drains an invocation and admits the next generation',
    () async {
      final runtimeDataRoot = await _stageInstalledStandardPlugin();
      addTearDown(() => runtimeDataRoot.delete(recursive: true));
      final runtime = PluginRuntime.desktopForTesting(
        runtimeRepositoryRoot: nodeRuntimeRepositoryRoot,
        runtimeDataRoot: runtimeDataRoot,
      );
      addTearDown(runtime.debugDispose);

      await runtime.invoke(const InstalledPluginsInvocation());
      final slow = runtime.invoke(
        const SourceDiscoverInvocation(
          pluginId: 'org.mgread.flutter.fixture',
          target: 'slow-nested',
        ),
      );
      final restart = runtime.configureNodeEnvironmentProxy(true);

      await slow;
      await restart;
      await runtime.invoke(const RuntimePingInvocation());
      expect(runtime.debugDesktopProcessStartCount, 2);
    },
    timeout: const Timeout(Duration(seconds: 20)),
  );

  test(
    'lifecycle drain timeout fails an in-flight call and closes its child',
    () async {
      final runtimeDataRoot = await _stageInstalledStandardPlugin();
      addTearDown(() => runtimeDataRoot.delete(recursive: true));
      final runtime = PluginRuntime.desktopForTesting(
        runtimeRepositoryRoot: nodeRuntimeRepositoryRoot,
        runtimeDataRoot: runtimeDataRoot,
      );
      addTearDown(runtime.debugDispose);

      await runtime.invoke(const InstalledPluginsInvocation());
      final slow = runtime.invoke(
        const SourceDiscoverInvocation(
          pluginId: 'org.mgread.flutter.fixture',
          target: 'slow-timeout',
        ),
      );
      final restart = runtime.configureNodeEnvironmentProxy(true);

      await expectLater(
        slow,
        throwsA(
          isA<PluginRuntimeException>().having(
            (error) => error.code,
            'code',
            'transport_disconnected',
          ),
        ),
      );
      await restart;
      await runtime.invoke(const RuntimePingInvocation());
      expect(runtime.debugDesktopProcessStartCount, 2);
    },
    timeout: const Timeout(Duration(seconds: 35)),
  );

  test(
    'concurrent lifecycle restarts are serialized into one next generation',
    () async {
      final runtime = PluginRuntime.desktopForTesting(
        runtimeRepositoryRoot: nodeRuntimeRepositoryRoot,
      );
      addTearDown(runtime.debugDispose);

      await runtime.invoke(const RuntimePingInvocation());
      await Future.wait(<Future<void>>[
        runtime.configureNodeEnvironmentProxy(true),
        runtime.configureNodeEnvironmentProxy(false),
      ]);
      await runtime.invoke(const RuntimePingInvocation());
      expect(runtime.debugDesktopProcessStartCount, 2);

      // The final false request was serialized after the true transition. A
      // stale out-of-queue comparison would leave the child configured true
      // and restart once more here.
      await runtime.configureNodeEnvironmentProxy(false);
      await runtime.invoke(const RuntimePingInvocation());
      expect(runtime.debugDesktopProcessStartCount, 2);
    },
  );

  test(
    'dispose closes startup admission before a child can be published',
    () async {
      final runtimeDataRoot = await Directory.systemTemp.createTemp(
        'mgread-runtime-startup-gate-',
      );
      final runtime = PluginRuntime.desktopForTesting(
        runtimeRepositoryRoot: nodeRuntimeRepositoryRoot,
        runtimeDataRoot: runtimeDataRoot,
        entrypointOverride: File(
          <String>[
            pluginRuntimeRepositoryRoot.path,
            'test',
            'fixtures',
            'hold-before-ready.mjs',
          ].join(Platform.pathSeparator),
        ),
      );
      addTearDown(() async {
        await runtime.debugDispose();
        await runtimeDataRoot.delete(recursive: true);
      });

      final pending = runtime.invoke(const RuntimePingInvocation());
      final entered = File(
        <String>[
          runtimeDataRoot.path,
          'startup-gate-entered',
        ].join(Platform.pathSeparator),
      );
      await _waitForFile(entered);

      final dispose = runtime.debugDispose();
      await File(
        <String>[
          runtimeDataRoot.path,
          'startup-gate-release',
        ].join(Platform.pathSeparator),
      ).writeAsString('release');
      await expectLater(
        pending,
        throwsA(
          isA<PluginRuntimeException>().having(
            (error) => error.code,
            'code',
            anyOf('runtime_unavailable', 'runtime_exited_before_ready'),
          ),
        ),
      );
      await dispose;
      expect(runtime.debugDesktopProcessStartCount, 1);
    },
  );

  test('repeated dispose calls share one completed cleanup', () async {
    final runtime = PluginRuntime.desktopForTesting(
      runtimeRepositoryRoot: nodeRuntimeRepositoryRoot,
    );
    await Future.wait(<Future<void>>[
      runtime.debugDispose(),
      runtime.debugDispose(),
    ]);
    await runtime.debugDispose();
  });
}
