<?php
/**
 * Plugin Name: Vistrow Voice Widget
 * Description: Embeds the Vistrow Voice AI call widget on your site. Paste the site key shown on the Website Widget page in your Vistrow Voice dashboard (Integrations) — that's the only thing you need to set.
 * Version: 1.2.1
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
        plugins_url('assets/icon.svg', __FILE__),
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
    ?>
    <div class="wrap">
        <h1>Vistrow Voice Widget</h1>
        <p>
            Paste the site key from your Vistrow Voice dashboard
            (<strong>Integrations &rarr; Website Widget</strong>) — that's the only thing you need to set up the
            AI call button on this site.
        </p>
        <form method="post" action="options.php">
            <?php settings_fields('vistrow_voice_widget_group'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="vistrow_site_key">Site Key</label></th>
                    <td>
                        <input type="text" id="vistrow_site_key"
                            name="<?php echo esc_attr(VISTROW_VOICE_OPTION); ?>[site_key]"
                            value="<?php echo esc_attr($settings['site_key']); ?>"
                            class="regular-text" placeholder="av_live_..." />
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="vistrow_label">Button label</label></th>
                    <td>
                        <input type="text" id="vistrow_label"
                            name="<?php echo esc_attr(VISTROW_VOICE_OPTION); ?>[label]"
                            value="<?php echo esc_attr($settings['label']); ?>"
                            class="regular-text" />
                    </td>
                </tr>
                <tr>
                    <th scope="row">Position</th>
                    <td>
                        <select name="<?php echo esc_attr(VISTROW_VOICE_OPTION); ?>[position]">
                            <option value="bottom-right" <?php selected($settings['position'], 'bottom-right'); ?>>Bottom right</option>
                            <option value="bottom-left" <?php selected($settings['position'], 'bottom-left'); ?>>Bottom left</option>
                        </select>
                    </td>
                </tr>
                <tr>
                    <th scope="row">Show widget on</th>
                    <td>
                        <label style="display:block;margin-bottom:6px;">
                            <input type="radio" name="<?php echo esc_attr(VISTROW_VOICE_OPTION); ?>[show_on]"
                                value="all" <?php checked($settings['show_on'], 'all'); ?> />
                            All pages
                        </label>
                        <label style="display:block;margin-bottom:8px;">
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
                        <p class="description">Cmd/Ctrl-click to select more than one page.</p>
                        <?php else : ?>
                            <p class="description">No pages found on this site yet.</p>
                        <?php endif; ?>
                    </td>
                </tr>
            </table>
            <?php submit_button('Save Settings'); ?>
        </form>
        <?php if (empty($settings['site_key'])) : ?>
            <p><em>The widget won't appear on your site until the site key above is filled in.</em></p>
        <?php endif; ?>
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
