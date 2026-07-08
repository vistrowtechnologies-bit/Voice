<?php
/**
 * Plugin Name: Arthale Voice Widget
 * Description: Embeds the Arthale Voice AI call widget on your site. Paste the site key shown on the Website Widget page in your Arthale Voice dashboard (Integrations) — that's the only thing you need to set.
 * Version: 1.1.0
 * Author: Arthale Voice
 */

if (!defined('ABSPATH')) {
    exit;
}

define('ARTHALE_VOICE_OPTION', 'arthale_voice_widget_settings');

// Every install of this plugin talks to the same Arthale Voice backend, so
// there's nothing for the site owner to look up or copy here — only the
// site key (which identifies THEIR site) is install-specific. Kept as a
// constant rather than a settings field so non-technical users only ever
// have to paste one value.
define('ARTHALE_VOICE_DEFAULT_BACKEND_URL', 'https://voice-production-2950.up.railway.app');

function arthale_voice_default_settings() {
    return array(
        'site_key' => '',
        'backend_url' => ARTHALE_VOICE_DEFAULT_BACKEND_URL,
        'position' => 'bottom-right',
        'label' => 'Talk to us',
    );
}

function arthale_voice_get_settings() {
    $saved = get_option(ARTHALE_VOICE_OPTION, array());
    return array_merge(arthale_voice_default_settings(), is_array($saved) ? $saved : array());
}

add_action('admin_menu', function () {
    add_options_page(
        'Arthale Voice Widget',
        'Arthale Voice',
        'manage_options',
        'arthale-voice-widget',
        'arthale_voice_render_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting('arthale_voice_widget_group', ARTHALE_VOICE_OPTION, array(
        'sanitize_callback' => 'arthale_voice_sanitize_settings',
    ));
});

function arthale_voice_sanitize_settings($input) {
    $defaults = arthale_voice_default_settings();
    return array(
        'site_key' => isset($input['site_key']) ? sanitize_text_field($input['site_key']) : $defaults['site_key'],
        'backend_url' => isset($input['backend_url']) ? esc_url_raw(rtrim($input['backend_url'], '/')) : $defaults['backend_url'],
        'position' => (isset($input['position']) && $input['position'] === 'bottom-left') ? 'bottom-left' : 'bottom-right',
        'label' => isset($input['label']) && $input['label'] !== '' ? sanitize_text_field($input['label']) : $defaults['label'],
    );
}

function arthale_voice_render_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }
    $settings = arthale_voice_get_settings();
    ?>
    <div class="wrap">
        <h1>Arthale Voice Widget</h1>
        <p>
            Paste the site key from your Arthale Voice dashboard
            (<strong>Integrations &rarr; Website Widget</strong>) — that's the only thing you need to set up the
            AI call button on this site.
        </p>
        <form method="post" action="options.php">
            <?php settings_fields('arthale_voice_widget_group'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="arthale_site_key">Site Key</label></th>
                    <td>
                        <input type="text" id="arthale_site_key"
                            name="<?php echo esc_attr(ARTHALE_VOICE_OPTION); ?>[site_key]"
                            value="<?php echo esc_attr($settings['site_key']); ?>"
                            class="regular-text" placeholder="av_live_..." />
                    </td>
                </tr>
                <tr>
                    <th scope="row"><label for="arthale_label">Button label</label></th>
                    <td>
                        <input type="text" id="arthale_label"
                            name="<?php echo esc_attr(ARTHALE_VOICE_OPTION); ?>[label]"
                            value="<?php echo esc_attr($settings['label']); ?>"
                            class="regular-text" />
                    </td>
                </tr>
                <tr>
                    <th scope="row">Position</th>
                    <td>
                        <select name="<?php echo esc_attr(ARTHALE_VOICE_OPTION); ?>[position]">
                            <option value="bottom-right" <?php selected($settings['position'], 'bottom-right'); ?>>Bottom right</option>
                            <option value="bottom-left" <?php selected($settings['position'], 'bottom-left'); ?>>Bottom left</option>
                        </select>
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
    $settings = arthale_voice_get_settings();
    if (empty($settings['site_key'])) {
        return; // not configured yet — nothing to render
    }
    printf(
        '<script src="%1$s/widget.js" data-site-key="%2$s" data-api-base="%1$s" data-position="%3$s" data-label="%4$s"></script>' . "\n",
        esc_url($settings['backend_url']),
        esc_attr($settings['site_key']),
        esc_attr($settings['position']),
        esc_attr($settings['label'])
    );
});
