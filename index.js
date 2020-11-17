/**
 * @file Menu for accessing sleep diary tools
 * @author Andrew Sayers (andrew-github.com@pileofstuff.org)
 * @copyright 2020
 * @license AGPLv3
 */

"use strict"

browser_utils.fix_browser_issues();

document.body.removeAttribute('style');

var diary = new Diary(),
    time = diary.data.entries.length ? luxon.DateTime.fromMillis(diary.data.entries[diary.data.entries.length-1].timestamp) : luxon.DateTime.local(),
    target_timestamp = diary.target_timestamp(),
    analysis = diary.analyse()

;

new Vue({

    el: '#app-container',

    vuetify: new Vuetify({ theme: { dark: diary.mode() === 1 } }),

    data: {

        // Main menu
        tab: 0,

        // "Editor" menu
        editor_dialog: false,
        editor_loading: 0,
        editor_error: false,
        editor_dialog_time_visible: false,
        editor_dialog_related_time_visible: false,
        editor_dialog_options: [
            { value: 0, icon: 'mdi-weather-sunny', text: 'Woke up' },
            { value: 1, icon: 'mdi-weather-night', text: 'Went to bed' },
            { value: 2, icon: 'mdi-alert-circle', text: 'Sleep disruption' },
            { value: 3, icon: 'mdi-food-apple', text: 'Ate something' },
            { value: 4, icon: 'mdi-cup-water', text: 'Drank something' },
            { value: 5, icon: 'mdi-coffee-outline', text: 'Drank caffeine' },
            { value: 6, icon: 'mdi-glass-mug-variant', text: 'Drank alcohol' },
            { value: 7, icon: 'mdi-toilet', text: 'Went to the bathroom' },
            { value: 8, icon: 'mdi-shower', text: 'Bath/shower' },
            { value: 9, icon: 'mdi-calendar-edit', text: 'Changed the target time' },
            { value: 10, icon: 'mdi-comment-outline', text: 'Other' },
        ].concat( diary.event_id_to_string.slice(11).map( (key,n) => {
            return { value: 11+n, text: key.toLowerCase() }
        })),
        editor_dialog_entry: null,
        editor_dialog_n: -1,
        editor_dialog_event: null,
        editor_dialog_comment: '',
        editor_dialog_date: 0,
        editor_dialog_time: 0,
        editor_dialog_has_related: false,
        editor_dialog_related_date: 0,
        editor_dialog_related_time: 0,


        // "Export your data" menu
        download_filename: 'Sleep diary (' + time.toFormat('yyyy-MM-dd HH:mm') + ')', // also used by "Backup and restore" menu
        download_format: 'csv',
        download_type: 'sleeps',
        restore_dialog: false,
        restore_failed: false,
        restore_succeeded: false,
        restore_diary: { data: { entries: [] } },
        restore_action: 'replace',

        // Sleep calendar:
        calendar_dialog: false,
        calendar_value: '',

        // Settings:

        online_backup: false,
        online_backup_dialog: false,
        sleep_planning: false,
        sleep_planning_dialog: false,

        server_active: !!diary.data.server,
        server_url: diary.data.server||'',
        server_active_on_cancel: 0,

        target_active: !!target_timestamp,
        sleep_planning_date_menu: false,
        sleep_planning_time_menu: false,
        sleep_planning_day_length:
        diary.data.preferredDayLength
            ?luxon.Duration.fromMillis(diary.data.preferredDayLength).toFormat('hh:mm')
            :analysis.day_duration_stats.trimmed_mean
            ?luxon.Duration.fromMillis(analysis.day_duration_stats.trimmed_mean).toFormat('hh:mm')
            :'25:00'
        ,
        sleep_planning_date: (target_timestamp?luxon.DateTime.fromMillis(target_timestamp):time).toFormat('yyyy-MM-dd'),
        sleep_planning_time: (target_timestamp?luxon.DateTime.fromMillis(target_timestamp):time).toFormat('HH:mm'),

        // History management:
        return_to_tab_zero: 0,

    },

    computed: {

        // "Manage your data" menu
        download_backup() {
            return 'data:text/plain,' + diary.serialise();
        },
        download_diary() {
            return 'data:text/csv;base64,' + btoa(
                "time,event,related time,comment\n" +
                    diary.data.entries.map(
                        entry => [
                            luxon.DateTime.fromMillis(entry.timestamp).toISO(),
                            diary.event_id_to_string[entry.event],
                            entry.related?luxon.DateTime.fromMillis(entry.related).toISO():'',
                            entry.comment||''
                        ].join(',') + "\n"
                    ).join("")
            );
        },
        download_calendar() {
            return 'data:text/csv;base64,' + btoa(
                "Measured sleep time,Measured wake time,Estimated sleep time,Estimated wake time\n" +
                    diary.analyse().sleeps.map(
                        sleep => [
                            sleep.sleep_time?luxon.DateTime.fromMillis(sleep.sleep_time).toISO():'',
                            sleep.wake_time ?luxon.DateTime.fromMillis(sleep.wake_time ).toISO():'',
                            luxon.DateTime.fromMillis(sleep.estimated_sleep_time).toISO(),
                            luxon.DateTime.fromMillis(sleep.estimated_wake_time ).toISO(),
                        ].join(',') + "\n"
                    ).join("")
            );

        },

        // Sleep calendar:

        calendar_events() {
            return diary.analyse().sleeps.map( sleep => {return {
                name: 'Asleep',
                start: new Date(sleep.estimated_sleep_time),
                end  : new Date(sleep.estimated_wake_time),
                timed: true,
            }});
        },

    },

    methods: {

        reset_diary() {
            time = diary.data.entries.length ? luxon.DateTime.fromMillis(diary.data.entries[diary.data.entries.length-1].timestamp) : luxon.DateTime.local();
            target_timestamp = diary.target_timestamp();
            analysis = diary.analyse();
            this.day_length =
                diary.data.preferredDayLength
                ?luxon.Duration.fromMillis(diary.data.preferredDayLength).toFormat('hh:mm')
                :analysis.day_duration_stats.trimmed_mean
                ?luxon.Duration.fromMillis(analysis.day_duration_stats.trimmed_mean).toFormat('hh:mm')
                :'25:00'
            ;
            this.target_date = (target_timestamp?luxon.DateTime.fromMillis(target_timestamp):time).toFormat('yyyy-MM-dd');
            this.target_time = (target_timestamp?luxon.DateTime.fromMillis(target_timestamp):time).toFormat('HH:mm');
            this.server_active = !!diary.data.server;
            this.server_url = diary.data.server||'';
        },

        // "Editor" menu
        editor_select(entry,n) {
            this.editor_dialog = true;
            this.editor_dialog_entry = entry;
            this.editor_dialog_n = n;
            this.editor_dialog_event = 0;
            this.editor_dialog_comment = '';
            this.editor_dialog_date = luxon.DateTime.local().toFormat('yyyy-MM-dd');
            this.editor_dialog_time = luxon.DateTime.local().toFormat('HH:mm');
            this.editor_dialog_has_related = false;
            this.editor_dialog_related_date = luxon.DateTime.local().toFormat('yyyy-MM-dd');
            this.editor_dialog_related_time = luxon.DateTime.local().toFormat('HH:mm');
            if ( entry ) {
                this.editor_dialog_event = entry.event;
                this.editor_dialog_comment = entry.comment;
                this.editor_dialog_date = luxon.DateTime.fromMillis(entry.timestamp).toFormat('yyyy-MM-dd');
                this.editor_dialog_time = luxon.DateTime.fromMillis(entry.timestamp).toFormat('HH:mm');
                this.editor_dialog_has_related = entry.event == diary.event_string_to_id.RETARGET && entry.related;
                if ( this.editor_dialog_has_related ) {
                    this.editor_dialog_related_date = luxon.DateTime.fromMillis(entry.related).toFormat('yyyy-MM-dd');
                    this.editor_dialog_related_time = luxon.DateTime.fromMillis(entry.related).toFormat('HH:mm');
                }
            }
        },
        editor_delete() {
            this.editor_error = false;
            this.editor_loading = 1;
            diary.splice_entries(
                this.editor_dialog_n,
                this.editor_dialog_n+1,
                [],
                () => { // success
                    this.editor_loading = 0;
                    this.editor_dialog = false;
                },
                () => { // error
                    this.editor_error = true;
                    this.editor_loading = 0;
                },
            );
        },
        editor_cancel() {
            this.editor_dialog = false;
        },
        editor_ok() {
            this.editor_dialog = false;
            this.editor_error = false;
            this.editor_loading = 1;

            var timestamp = luxon.DateTime.fromString(this.editor_dialog_date+' '+this.editor_dialog_time,'yyyy-MM-dd HH:mm').toMillis(),
                related = (
                    this.editor_dialog_has_related
                        ? luxon.DateTime.fromString(this.editor_dialog_related_date+' '+this.editor_dialog_related_time,'yyyy-MM-dd HH:mm').toMillis()
                        : 0
                ),
                n = this.editor_dialog_entry ? this.editor_dialog_n : diary.data.entries.length,
                entry
            ;

            if ( this.editor_dialog_entry ) {
                entry = this.editor_dialog_entry;
                entry.event = this.editor_dialog_event;
                entry.timestamp = timestamp;
                entry.related = related;
                entry.comment = this.editor_dialog_comment;
            } else {
                entry = [
                    this.editor_dialog_event,
                    timestamp,
                    related,
                    this.editor_dialog_comment,
                ];
            }

            diary.splice_entries(
                n,
                n+1,
                [entry],
                () => { // success
                    this.editor_loading = 0;
                    this.editor_dialog = false;
                },
                () => { // error
                    this.editor_error = true;
                    this.editor_loading = 0;
                },
            );

        },

        // "Manage your data" menu
        restore_available(event) {
            var reader = new FileReader();
            reader.onload = () => {
                try {
                    var new_diary = new Diary(reader.result);
                    if ( diary && diary.data && diary.data.entries.length ) {
                        if ( new_diary && new_diary.data ) {
                            this.restore_dialog = true;
                            this.restore_diary = new_diary;
                        }
                    } else {
                        new_diary.constructed_from_string = false;
                        diary = new_diary;
                        this.reset_diary();
                        diary.save();
                        this.restore_succeeded = true;
                    }
                } catch (e) {
                    this.restore_failed = true;
                }
            };
            reader.readAsText(event.target.files[0]);
        },
        restore_cancel() {
            this.restore_dialog = false;
        },
        restore_ok() {
            if ( this.restore_action == 'replace' ) {
                this.restore_diary.constructed_from_string = false;
                diary = this.restore_diary;
                this.reset_diary();
                diary.save();
            } else {
                diary.splice_entries(
                    diary.data.entries.length,
                    diary.data.entries.length,
                    this.restore_diary.data.entries
                );
                this.reset_diary();
            }
            this.restore_dialog = false;
        },

        // Calendar

        calendar_change({ start, end }) {
            return diary.analyse().sleeps.map( sleep => {return {
                name: 'Asleep',
                start: new Date(sleep.estimated_sleep_time),
                end  : new Date(sleep.estimated_wake_time),
                timed: true,
            }});
        },

        // Settings

        online_backup_click() {
            this.server_active_on_cancel = this.server_active;
            this.online_backup_dialog=true;
        },
        online_backup_switch() {
            this.online_backup_dialog = this.server_active && !this.server_url;
            this.server_active_on_cancel = !this.server_active;
            if ( !this.online_backup_dialog ) {
                diary.server( this.server_active ? this.server_url : '' );
            }
        },
        online_backup_cancel() {
            this.server_active = this.server_active_on_cancel;
            this.online_backup_dialog = false;
        },
        online_backup_ok() {
            this.server_active = !!this.server_url;
            this.online_backup_dialog = false;
            diary.server( this.server_url );
        },

        sleep_planning_switch() {
            this.sleep_planning_dialog = this.target_active;
            if ( !this.target_active ) {
                diary.add_entry('RETARGET');
            }
        },
        sleep_planning_cancel() {
            this.sleep_planning_dialog = false;
        },
        sleep_planning_ok() {
            var target = luxon.DateTime.fromString(this.sleep_planning_date+' '+this.sleep_planning_time,'yyyy-MM-dd HH:mm').toMillis(),
                preferred_day_values = this.sleep_planning_day_length.split(':').map( t => parseInt(t,10) ),
                preferred_day_length = (preferred_day_values[0]*60+preferred_day_values[1])*60000
            ;
            this.target_active = true;
            diary.set_preferred_day_length(preferred_day_length);
            diary.add_entry('RETARGET',new Date().getTime(),target);
            this.sleep_planning_dialog = false;
        },

        // History management

        set_tab(n) {
            location.hash='#tab='+n;
        },
        reset_tab() {
            if ( this.return_to_tab_zero ) {
                history.back();
            } else {
                location.hash='';
            }
        },

    },

    mounted() {
        location.hash.replace( /^#tab=(\d+)/, (_,n) => this.tab=parseInt(n,10) );
        this.return_to_tab_zero = this.tab == 0;
        window.onpopstate = () => {
            var match = location.hash.match( /^#tab=(\d+)/ );
            if ( match ) {
                this.tab=parseInt(match[1],10);
            } else {
                this.tab=0;
            }
            this.return_to_tab_zero |= this.tab == 0;
        }
    },

});
