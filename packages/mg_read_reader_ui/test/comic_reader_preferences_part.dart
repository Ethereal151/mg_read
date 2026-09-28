/// Comic reader preference and image retry behavior.
part of 'comic_reader_test.dart';

void _registerComicPreferencesTests() {
  test('comic preferences always normalize image spacing to zero', () {
    expect(
      const ComicReaderPreferences(imageSpacing: 24).normalized().imageSpacing,
      0,
    );
  });

  test('comic reader keeps page-turn shortcut preference in copies', () {
    expect(ComicReaderPreferences.defaults.pageTurnShortcuts, isTrue);
    expect(ComicReaderPreferences.defaults.pageTurnFraction, .9);
    expect(ComicReaderPreferences.pageTurnFractions, <double>[
      .3,
      .5,
      .8,
      .9,
      1,
    ]);
    expect(
      ComicReaderPreferences.defaults
          .copyWith(
            pageTurnShortcuts: false,
            pageTurnFraction: .5,
            pageTurnLayout: ComicPageTurnLayout.horizontal,
            singleHandMode: true,
          )
          .pageTurnShortcuts,
      isFalse,
    );
    final ComicReaderPreferences configured = ComicReaderPreferences.defaults
        .copyWith(
          pageTurnFraction: .5,
          pageTurnLayout: ComicPageTurnLayout.horizontal,
          singleHandMode: true,
        )
        .normalized();
    expect(configured.pageTurnFraction, .5);
    expect(configured.pageTurnLayout, ComicPageTurnLayout.horizontal);
    expect(configured.singleHandMode, isTrue);
    expect(
      const ComicReaderPreferences(
        pageTurnFraction: .82,
      ).normalized().pageTurnFraction,
      .8,
    );
  });

  test(
    'comic image retries use jittered and near-viewport scheduling',
    () async {
      var nearViewport = false;
      var retryCalls = 0;
      final coordinator = ComicImageRetryCoordinator(
        retryDelay: () => const Duration(milliseconds: 20),
        scanDebounce: const Duration(milliseconds: 2),
      );
      addTearDown(coordinator.dispose);

      coordinator.register(
        key: 'far',
        isNearViewport: () => nearViewport,
        retry: () async {
          retryCalls++;
          coordinator.markResolved('far');
        },
      );
      await Future<void>.delayed(const Duration(milliseconds: 8));
      expect(retryCalls, 0);

      nearViewport = true;
      coordinator.onViewportChanged();
      await Future<void>.delayed(const Duration(milliseconds: 8));
      expect(retryCalls, 1);

      coordinator.register(
        key: 'near',
        isNearViewport: () => true,
        retry: () async {
          retryCalls++;
          coordinator.markResolved('near');
        },
      );
      await Future<void>.delayed(const Duration(milliseconds: 8));
      expect(retryCalls, 2);
    },
  );

  test('comic image retry coordinator keeps one request in flight', () async {
    final coordinator = ComicImageRetryCoordinator(
      retryDelay: () => Duration.zero,
      scanDebounce: const Duration(milliseconds: 2),
    );
    addTearDown(coordinator.dispose);
    final Completer<void> firstRetry = Completer<void>();
    var active = 0;
    var peakActive = 0;
    var retryCalls = 0;

    coordinator.register(
      key: 'first',
      isNearViewport: () => true,
      retry: () async {
        active++;
        peakActive = active > peakActive ? active : peakActive;
        retryCalls++;
        await firstRetry.future;
        active--;
        coordinator.markResolved('first');
      },
    );
    coordinator.register(
      key: 'second',
      isNearViewport: () => true,
      retry: () async {
        active++;
        peakActive = active > peakActive ? active : peakActive;
        retryCalls++;
        active--;
        coordinator.markResolved('second');
      },
    );

    await Future<void>.delayed(const Duration(milliseconds: 8));
    expect(retryCalls, 1);
    expect(peakActive, 1);
    firstRetry.complete();
    await Future<void>.delayed(const Duration(milliseconds: 8));
    expect(retryCalls, 2);
    expect(peakActive, 1);
  });

  testWidgets(
    'comic images use decoded dimensions and meet without fixed-extent gaps',
    (WidgetTester tester) async {
      tester.view
        ..physicalSize = const Size(400, 800)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final Uint8List wide = Uint8List.fromList(
        base64Decode('UklGRh4AAABXRUJQVlA4TBEAAAAvAwAAAAdQs840s/+BiOh/AAA='),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ComicReaderView(
            bookId: 'book',
            dataSource: _MismatchedAspectComicSource(wide),
            stateStore: _MemoryComicStateStore(),
          ),
        ),
      );
      for (int frame = 0; frame < 20; frame++) {
        await tester.pump(const Duration(milliseconds: 50));
      }

      final Rect first = tester.getRect(
        find.byKey(const ValueKey<String>('comic-reader-image-chapter-1-one')),
      );
      final Rect second = tester.getRect(
        find.byKey(const ValueKey<String>('comic-reader-image-chapter-1-two')),
      );
      expect(first.height, closeTo(100, .1));
      expect(second.top, closeTo(first.bottom, .1));
    },
  );
}
