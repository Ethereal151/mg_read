/// Host-owned identity card for source discovery documents.
///
/// The source supplies verified display strings and an optional proxied image URL;
/// this widget owns layout, theme, image fallback and accessibility.
/// It performs no account request or persistence.
library;

import 'package:flutter/material.dart';
import 'package:mgread_plugin_runtime/mgread_plugin_runtime.dart';

import 'package:mg_read/app/app_theme.dart';

class DiscoveryProfileCard extends StatelessWidget {
  const DiscoveryProfileCard({required this.profile, super.key});

  final PluginDiscoveryProfileCardComponent profile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens = AppThemeTokens.of(context);
    return Semantics(
      container: true,
      label: [profile.name, profile.badge, profile.subtitle].whereType<String>().join('，'),
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: <Color>[tokens.accentSoft, tokens.surface],
          ),
          borderRadius: AppRadii.discoveryPanel,
          border: Border.all(color: tokens.divider),
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  _ProfileAvatar(url: profile.avatarUrl),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          profile.name,
                          key: const Key('runtime-discovery-profile-name'),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleLarge?.copyWith(color: theme.colorScheme.onSurface, fontWeight: FontWeight.w700),
                        ),
                        if (profile.badge != null) ...<Widget>[
                          const SizedBox(height: 8),
                          DecoratedBox(
                            decoration: BoxDecoration(
                              color: tokens.surface,
                              borderRadius: BorderRadius.circular(100),
                              border: Border.all(color: tokens.divider),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              child: Text(
                                profile.badge!,
                                style: theme.textTheme.labelMedium?.copyWith(color: tokens.accent, fontWeight: FontWeight.w700),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              if (profile.subtitle != null) ...<Widget>[
                const SizedBox(height: 16),
                Text(profile.subtitle!, style: theme.textTheme.bodyMedium?.copyWith(color: tokens.mutedText)),
              ],
              if (profile.details.isNotEmpty) ...<Widget>[
                const SizedBox(height: 20),
                Divider(height: 1, color: tokens.divider),
                const SizedBox(height: 12),
                for (final detail in profile.details) ...<Widget>[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(detail.label, style: theme.textTheme.bodySmall?.copyWith(color: tokens.mutedText)),
                        const SizedBox(width: 16),
                        Expanded(
                          child: Text(
                            detail.value,
                            textAlign: TextAlign.end,
                            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurface, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfileAvatar extends StatelessWidget {
  const _ProfileAvatar({required this.url});

  final Uri? url;

  @override
  Widget build(BuildContext context) {
    final tokens = AppThemeTokens.of(context);
    final fallback = ColoredBox(
      color: tokens.surface,
      child: Icon(Icons.person_rounded, size: 32, color: tokens.accent),
    );
    return ClipOval(
      child: SizedBox.square(
        dimension: 64,
        child: url == null ? fallback : Image.network(url.toString(), fit: BoxFit.cover, errorBuilder: (_, _, _) => fallback),
      ),
    );
  }
}
