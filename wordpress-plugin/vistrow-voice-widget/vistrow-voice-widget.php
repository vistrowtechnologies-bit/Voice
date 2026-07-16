<?php
/**
 * Plugin Name: Vistrow Voice Widget
 * Description: Embeds the Vistrow Voice AI call widget on your site. Paste the site key shown on the Website Widget page in your Vistrow Voice dashboard (Integrations) — that's the only thing you need to set.
 * Version: 1.3.1
 * Author: Vistrow Voice
 */

if (!defined('ABSPATH')) {
    exit;
}

define('VISTROW_VOICE_OPTION', 'vistrow_voice_widget_settings');

// Every install of this plugin talks to the same Vistrow Voice backend, so
// there's nothing for the site owner to look up or copy here — only the
// site key (which identifies THEIR site) is install-specific. Kept as a
// constant rather than a settings field so non-technical users only ever
// have to paste one value.
define('VISTROW_VOICE_DEFAULT_BACKEND_URL', 'https://voice-production-2950.up.railway.app');

// Where the "your leads" / "open dashboard" links on the settings page point —
// the actual Vistrow Voice web app, a different host from the widget backend
// above (that one just serves the embed script + call API).
define('VISTROW_VOICE_DASHBOARD_URL', 'https://voice-three-flax.vercel.app');

function vistrow_voice_default_settings() {
    return array(
        'site_key' => '',
        'backend_url' => VISTROW_VOICE_DEFAULT_BACKEND_URL,
        'position' => 'bottom-right',
        'label' => 'Talk to Artha',
        // 'all' keeps existing installs behaving exactly as before (widget
        // on every page) — 'selected' is opt-in so nobody's widget silently
        // disappears sitewide just from upgrading the plugin.
        'show_on' => 'all',
        'pages' => array(),
    );
}

function vistrow_voice_get_settings() {
    $saved = get_option(VISTROW_VOICE_OPTION, array());
    return array_merge(vistrow_voice_default_settings(), is_array($saved) ? $saved : array());
}

// The admin-menu icon must be a base64-encoded SVG data URI, NOT a plain image
// URL. WordPress only renders base64 SVGs the way sibling plugin icons look —
// a single-colour glyph sized to 20px via CSS background-size, blending into
// the dark sidebar. A raster PNG is dropped in as a literal <img> (shows its
// own background/colours, so a full badge reads as an out-of-place tile), and
// a plain .svg URL takes the same <img> path with no size constraint, so its
// native 1254px dimensions render as a giant blob over the page. The glyph
// file (assets/menu-icon.svg) is just the waveform, no badge, in WP's default
// icon grey.
function vistrow_voice_menu_icon() {
    $svg = @file_get_contents(plugin_dir_path(__FILE__) . 'assets/menu-icon.svg');
    if (!$svg) {
        return 'dashicons-microphone'; // graceful fallback if the asset is missing
    }
    return 'data:image/svg+xml;base64,' . base64_encode($svg);
}

add_action('admin_menu', function () {
    // A top-level sidebar item (not tucked under Settings) so it survives
    // being obvious to find after every plugin re-upload/update — same
    // pattern as other plugins' own dedicated menu entries.
    add_menu_page(
        'Vistrow Voice Widget',
        'Vistrow Voice',
        'manage_options',
        'vistrow-voice-widget',
        'vistrow_voice_render_settings_page',
        vistrow_voice_menu_icon(),
        58
    );
});

add_action('admin_init', function () {
    register_setting('vistrow_voice_widget_group', VISTROW_VOICE_OPTION, array(
        'sanitize_callback' => 'vistrow_voice_sanitize_settings',
    ));
});

function vistrow_voice_sanitize_settings($input) {
    $defaults = vistrow_voice_default_settings();
    return array(
        'site_key' => isset($input['site_key']) ? sanitize_text_field($input['site_key']) : $defaults['site_key'],
        'backend_url' => isset($input['backend_url']) ? esc_url_raw(rtrim($input['backend_url'], '/')) : $defaults['backend_url'],
        'position' => (isset($input['position']) && $input['position'] === 'bottom-left') ? 'bottom-left' : 'bottom-right',
        'label' => isset($input['label']) && $input['label'] !== '' ? sanitize_text_field($input['label']) : $defaults['label'],
        'show_on' => (isset($input['show_on']) && $input['show_on'] === 'selected') ? 'selected' : 'all',
        'pages' => isset($input['pages']) && is_array($input['pages']) ? array_map('absint', $input['pages']) : array(),
    );
}

function vistrow_voice_render_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    $settings = vistrow_voice_get_settings();
    $connected = !empty($settings['site_key']);
    ?>
    <style>
        .vvw-wrap { max-width: 1040px; margin-top: 20px; }
        .vvw-header { display: flex; align-items: center; gap: 14px; padding: 20px 24px; background: linear-gradient(135deg,#1b1230,#2a1a4a); border-radius: 10px; margin-bottom: 20px; }
        .vvw-header img { width: 40px; height: 40px; border-radius: 9px; flex-shrink: 0; }
        .vvw-header h1 { color: #fff; font-size: 20px; margin: 0 0 2px; padding: 0; line-height: 1.3; }
        .vvw-header p { color: #c9c0e8; margin: 0; font-size: 13px; }
        .vvw-status { margin-left: auto; display: flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
        .vvw-status.is-on { background: rgba(74,222,128,0.15); color: #4ade80; }
        .vvw-status.is-off { background: rgba(251,191,36,0.15); color: #fbbf24; }
        .vvw-status .dot { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
        .vvw-grid { display: grid; grid-template-columns: minmax(0,1fr) 300px; gap: 20px; align-items: start; }
        .vvw-card { background: #fff; border: 1px solid #dcdcde; border-radius: 8px; padding: 22px 24px; }
        .vvw-card + .vvw-card { margin-top: 16px; }
        .vvw-card h2 { font-size: 14px; margin: 0 0 4px; }
        .vvw-card .vvw-card-desc { color: #646970; font-size: 13px; margin: 0 0 16px; }
        .vvw-field { margin-bottom: 20px; }
        .vvw-field:last-child { margin-bottom: 0; }
        .vvw-field label.vvw-label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 4px; }
        .vvw-help { color: #646970; font-size: 12.5px; margin: 4px 0 0; }
        .vvw-radio-row { display: block; margin-bottom: 6px; font-weight: 400; }
        .vvw-link-btn { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border: 1px solid #dcdcde; border-radius: 6px; text-decoration: none; color: #1d2327; font-size: 13px; font-weight: 500; margin-bottom: 8px; }
        .vvw-link-btn:last-child { margin-bottom: 0; }
        .vvw-link-btn:hover { border-color: #7c3aed; color: #7c3aed; }
        .vvw-link-btn .dashicons { font-size: 16px; width: 16px; height: 16px; opacity: .6; }
    </style>
    <div class="wrap vvw-wrap">
        <div class="vvw-header">
            <img src="<?php echo esc_url(plugins_url('assets/icon.png', __FILE__)); ?>" alt="" />
            <div>
                <h1>Vistrow Voice Widget</h1>
                <p>The AI call button for this site — powered by your Vistrow Voice account.</p>
            </div>
            <span class="vvw-status <?php echo $connected ? 'is-on' : 'is-off'; ?>">
                <span class="dot"></span><?php echo $connected ? 'Connected' : 'Not connected'; ?>
            </span>
        </div>

        <div class="vvw-grid">
            <div>
                <form method="post" action="options.php">
                    <?php settings_fields('vistrow_voice_widget_group'); ?>
                    <div class="vvw-card">
                        <h2>Connection</h2>
                        <p class="vvw-card-desc">Links this WordPress site to your Vistrow Voice account.</p>

                        <div class="vvw-field">
                            <label class="vvw-label" for="vistrow_site_key">Site Key</label>
                            <input type="text" id="vistrow_site_key"
                                name="<?php echo esc_attr(VISTROW_VOICE_OPTION); ?>[site_key]"
                                value="<?php echo esc_attr($settings['site_key']); ?>"
                                class="regular-text" placeholder="av_live_..." />
                            <p class="vvw-help">
                                Found in your Vistrow Voice dashboard under
                                <strong>Integrations &rarr; Website Widget</strong>. This is what tells us which
                                account this site's calls and leads belong to.
                            </p>
                        </div>
                    </div>

                    <div class="vvw-card">
                        <h2>Appearance</h2>
                        <p class="vvw-card-desc">How the call button looks and where it shows up.</p>

                        <div class="vvw-field">
                            <label class="vvw-label" for="vistrow_label">Button label</label>
                            <input type="text" id="vistrow_label"
                                name="<?php echo esc_attr(VISTROW_VOICE_OPTION); ?>[label]"
                                value="<?php echo esc_attr($settings['label']); ?>"
                                class="regular-text" />
                            <p class="vvw-help">The text visitors see next to the floating call button.</p>
                        </div>

                        <div class="vvw-field">
                            <label class="vvw-label">Position</label>
                            <select name="<?php echo esc_attr(VISTROW_VOICE_OPTION); ?>[position]">
                                <option value="bottom-right" <?php selected($settings['position'], 'bottom-right'); ?>>Bottom right</option>
                                <option value="bottom-left" <?php selected($settings['position'], 'bottom-left'); ?>>Bottom left</option>
                            </select>
                            <p class="vvw-help">Which corner of the screen the button appears in.</p>
                        </div>

                        <div class="vvw-field">
                            <label class="vvw-label">Show widget on</label>
                            <label class="vvw-radio-row">
                                <input type="radio" name="<?php echo esc_attr(VISTROW_VOICE_OPTION); ?>[show_on]"
                                    value="all" <?php checked($settings['show_on'], 'all'); ?> />
                                All pages
                            </label>
                            <label class="vvw-radio-row">
                                <input type="radio" name="<?php echo esc_attr(VISTROW_VOICE_OPTION); ?>[show_on]"
                                    value="selected" <?php checked($settings['show_on'], 'selected'); ?> />
                                Only the pages I select below
                            </label>
                            <?php
                            $all_pages = get_pages(array('sort_column' => 'post_title'));
                            if ($all_pages) :
                            ?>
                            <select name="<?php echo esc_attr(VISTROW_VOICE_OPTION); ?>[pages][]" multiple
                                size="<?php echo esc_attr(min(10, max(4, count($all_pages)))); ?>"
                                style="min-width:280px;">
                                <?php foreach ($all_pages as $page) : ?>
                                    <option value="<?php echo esc_attr($page->ID); ?>"
                                        <?php selected(in_array((int) $page->ID, $settings['pages'], true)); ?>>
                                        <?php echo esc_html($page->post_title); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                            <p class="vvw-help">
                                Choose whether the call button appears everywhere on this site or only on the
                                pages you pick here. Cmd/Ctrl-click to select more than one. Only used when
                                "Only the pages I select below" is chosen above.
                            </p>
                            <?php else : ?>
                                <p class="vvw-help">No pages found on this site yet.</p>
                            <?php endif; ?>
                        </div>
                    </div>

                    <?php submit_button('Save Settings'); ?>
                </form>

                <?php if (!$connected) : ?>
                    <div class="notice notice-warning inline" style="margin-top:0;">
                        <p>The call button won't appear on your site until the site key above is filled in.</p>
                    </div>
                <?php endif; ?>
            </div>

            <div>
                <div class="vvw-card">
                    <h2>Your leads</h2>
                    <p class="vvw-card-desc">Every call this widget captures — name, phone, transcript — lands in
                        your Vistrow Voice CRM automatically.</p>
                    <a class="vvw-link-btn" href="<?php echo esc_url(VISTROW_VOICE_DASHBOARD_URL . '/dashboard/calls'); ?>" target="_blank" rel="noopener">
                        View captured leads (CRM) <span class="dashicons dashicons-external"></span>
                    </a>
                </div>
                <div class="vvw-card">
                    <h2>Quick links</h2>
                    <a class="vvw-link-btn" href="<?php echo esc_url(VISTROW_VOICE_DASHBOARD_URL . '/dashboard'); ?>" target="_blank" rel="noopener">
                        Open dashboard <span class="dashicons dashicons-external"></span>
                    </a>
                    <a class="vvw-link-btn" href="<?php echo esc_url(VISTROW_VOICE_DASHBOARD_URL . '/dashboard/website-widget'); ?>" target="_blank" rel="noopener">
                        Manage this site's widget <span class="dashicons dashicons-external"></span>
                    </a>
                    <a class="vvw-link-btn" href="mailto:sales@vistrow.ai?subject=<?php echo rawurlencode('Vistrow Voice widget help — ' . get_bloginfo('name')); ?>">
                        Need help? Contact us <span class="dashicons dashicons-email"></span>
                    </a>
                </div>
            </div>
        </div>
    </div>
    <?php
}

add_action('wp_footer', function () {
    $settings = vistrow_voice_get_settings();
    if (empty($settings['site_key'])) {
        return; // not configured yet — nothing to render
    }
    if ($settings['show_on'] === 'selected') {
        $current_id = get_queried_object_id();
        if (!$current_id || !in_array((int) $current_id, $settings['pages'], true)) {
            return; // this page wasn't checked in the settings page picker
        }
    }
    printf(
        '<script src="%1$s/widget.js" data-site-key="%2$s" data-api-base="%1$s" data-position="%3$s" data-label="%4$s"></script>' . "\n",
        esc_url($settings['backend_url']),
        esc_attr($settings['site_key']),
        esc_attr($settings['position']),
        esc_attr($settings['label'])
    );
});
