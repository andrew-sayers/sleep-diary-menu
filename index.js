/**
 * @file Menu for accessing sleep diary tools
 * @author Andrew Sayers (andrew-github.com@pileofstuff.org)
 * @copyright 2020
 * @license AGPLv3
 */

/*
 * VUE PERFORMANCE NOTE
 *
 * Vue.js modifies variables so it can detect when they're modified.
 * This makes Vue code much quicker to write, but also makes complex
 * operations on diaries several hundred times slower.
 *
 * There are several pieces of code like the following in this file:
 *
 *     if ( !this.diary.entries() ) return; // see VUE PERFORMANCE NOTE, above
 *     var diary = new Diary();
 *     ... operations on diary instead of this.diary ...
 *
 * The first line tells Vue that this code reacts to changes in
 * this.diary, the second line loads a new instance without Vue stuff.
 */

"use strict"

browser_utils.fix_browser_issues();

document.body.removeAttribute('style');

var diary = new Diary(),
    time = diary.entries().length ? luxon.DateTime.fromMillis(diary.entries()[diary.entries().length-1].timestamp) : luxon.DateTime.local(),
    target_timestamp = diary.target_timestamp(),
    sleep_wake_periods = diary.sleep_wake_periods(),
    event_string_to_id = diary.event_string_to_id,
    event_id_to_string = diary.event_id_to_string
;

new Vue({

    el: '#app-container',

    vuetify: new Vuetify({ theme: { dark: diary.mode() === 1 } }),

    data: {

        diary: diary,
        sleep_wake_periods: sleep_wake_periods,

        // Main menu
        tab: 0,

        // "Editor" menu
        editor_headers: [
            { text: 'Event', value: 'event', },
            { text: 'Time' , value: 'timestamp', },
            { text: 'Related' , value: 'related', },
            { text: '' , value: 'comment', sortable: false },
        ],
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
        ].concat( event_id_to_string.slice(11).map( (key,n) => {
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
        restore_diary: { entries: ()=>[] },
        restore_action: 'replace',

        // Sleep calendar:
        calendar_dialog: false,
        calendar_value: '',

        // Settings:

        online_backup: false,
        online_backup_dialog: false,
        online_backup_failed: false,
        sleep_planning: false,
        sleep_planning_dialog: false,

        server_active: !!diary.server(),
        server_url: diary.server()||'',
        server_active_on_cancel: 0,
        server_start: diary.server_entries_offset() ? 'latest' : 'start',

        target_active: !!target_timestamp,
        target_timestamp: target_timestamp,
        sleep_planning_date_menu: false,
        sleep_planning_time_menu: false,
        sleep_planning_day_length:
          luxon.Duration.fromMillis(
              diary.preferred_day_length() ||
              sleep_wake_periods.day_summary.recommended_average ||
              25*60*60*1000
          ).toFormat('hh:mm')
        ,
        sleep_planning_date: (target_timestamp?luxon.DateTime.fromMillis(target_timestamp):time).toFormat('yyyy-MM-dd'),
        sleep_planning_time: (target_timestamp?luxon.DateTime.fromMillis(target_timestamp):time).toFormat('HH:mm'),

        // "Debugging" menu:
        debug_messages: [],

        // History management:
        return_to_tab_zero: 0,

    },

    computed: {

        // "Manage your data" menu
        download_backup() {
            if ( !this.diary.entries() ) return; // see VUE PERFORMANCE NOTE, above
            return 'data:text/plain,' + new Diary().serialise();
        },
        download_diary() {
            if ( !this.diary.entries() ) return; // see VUE PERFORMANCE NOTE, above
            var ret = new Diary().toColumns();
            ret.slice(1).forEach( row => {
                row[0] = luxon.DateTime.fromMillis(row[0]).toISO();
                if ( row[2] ) row[2] = luxon.DateTime.fromMillis(row[2]).toISO();
            });
            return 'data:text/csv;base64,' + btoa(ret.map( row => row.join(',')+"\n" ).join(''));
        },
        download_calendar() {
            if ( !this.diary.entries() ) return; // see VUE PERFORMANCE NOTE, above
            var ret = new Diary().toColumnsCalendar();
            ret.slice(1).forEach( row => {
                for ( var n=1; n!=3; ++n ) {
                    if ( row[n] ) row[n] = luxon.DateTime.fromMillis(row[n]).toISO();
                }
            });
            return 'data:text/csv;base64,' + btoa(ret.map( row => row.join(',')+"\n" ).join(''));
        },

        // "Editor" menu:
        editor_entries() {
            if ( !this.diary.entries() ) return; // see VUE PERFORMANCE NOTE, above
            return new Diary().entries().slice(0).map( (entry,n) => {
                return {
                    event: entry.event,
                    icon: this.editor_dialog_options[entry.event] ? this.editor_dialog_options[entry.event].icon : undefined,
                    timestamp: luxon.DateTime.fromMillis(entry.timestamp),
                    related: entry.related,
                    comment: entry.comment,
                    key: [entry.event,entry.timestamp,!!entry.comment,n].join(' '),
                    n: n,
                }
            }).reverse();
        },

        // Sleep calendar:

        calendar_events() {
            if ( !this.diary.entries() ) return; // see VUE PERFORMANCE NOTE, above
            return new Diary().sleep_wake_periods().records
                .filter( r => r.status == 'asleep' && r.end_time )
                .map( r => ({
                    name: 'Asleep',
                    start: new Date(r.start_time),
                    end  : new Date(r.end_time),
                    timed: true,
                }));
        },

    },

    methods: {

        reset_diary() {
            time = this.diary.entries().length ? luxon.DateTime.fromMillis(this.diary.entries()[this.diary.entries().length-1].timestamp) : luxon.DateTime.local();
            target_timestamp = this.target_timestamp = this.diary.target_timestamp();
            this.target_active = !!target_timestamp;
            sleep_wake_periods = this.sleep_wake_periods = diary.sleep_wake_periods(),
            this.day_length =
                luxon.Duration.fromMillis(
                    diary.preferred_day_length() ||
                    sleep_wake_periods.day_summary.recommended_average ||
                    25*60*60*1000
                ).toFormat('hh:mm')
            ;
            this.target_date = (target_timestamp?luxon.DateTime.fromMillis(target_timestamp):time).toFormat('yyyy-MM-dd');
            this.target_time = (target_timestamp?luxon.DateTime.fromMillis(target_timestamp):time).toFormat('HH:mm');
            this.server_active = !!this.diary.server();
            this.server_url = this.diary.server()||'';
        },

        // "Editor" menu:
        editor_select(entry) {
            this.editor_dialog = true;
            this.editor_dialog_entry = entry ? this.diary.entries()[entry.n] : 0;
            this.editor_dialog_n = this.diary.entries().length;
            this.editor_dialog_event = 0;
            this.editor_dialog_comment = '';
            this.editor_dialog_date = luxon.DateTime.local().toFormat('yyyy-MM-dd');
            this.editor_dialog_time = luxon.DateTime.local().toFormat('HH:mm');
            this.editor_dialog_has_related = false;
            this.editor_dialog_related_date = luxon.DateTime.local().toFormat('yyyy-MM-dd');
            this.editor_dialog_related_time = luxon.DateTime.local().toFormat('HH:mm');
            if ( entry ) {
                this.editor_dialog_n = entry.n;
                this.editor_dialog_event = entry.event;
                this.editor_dialog_comment = entry.comment;
                this.editor_dialog_date = entry.timestamp.toFormat('yyyy-MM-dd');
                this.editor_dialog_time = entry.timestamp.toFormat('HH:mm');
                this.editor_dialog_has_related = entry.event == event_string_to_id.RETARGET && entry.related;
                if ( this.editor_dialog_has_related ) {
                    this.editor_dialog_related_date = luxon.DateTime.fromMillis(entry.related).toFormat('yyyy-MM-dd');
                    this.editor_dialog_related_time = luxon.DateTime.fromMillis(entry.related).toFormat('HH:mm');
                }
            }
        },
        editor_delete() {
            this.editor_error = false;
            this.editor_loading = 1;
            this.diary.splice_entries(
                this.editor_dialog_n,
                1,
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

            this.diary.splice_entries(
                this.editor_dialog_n,
                1,
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
                    if ( this.diary && this.diary.entries().length ) {
                        this.restore_dialog = true;
                        this.restore_diary = new_diary;
                    } else {
                        diary = this.diary = new_diary;
                        this.reset_diary();
                        this.diary.save(true);
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
                diary = this.diary = this.restore_diary;
                this.reset_diary();
                this.diary.save(true);
            } else {
                this.diary.splice_entries(
                    this.diary.entries().length,
                    0,
                    this.restore_diary.entries()
                );
                this.reset_diary();
            }
            this.restore_dialog = false;
        },

        // Calendar

        calendar_change() {
            return new Diary().sleep_wake_periods().records
                .filter( r => r.status == 'asleep' && r.end_time )
                .map( r => ({
                    name: 'Asleep',
                    start: new Date(r.start_time),
                    end  : new Date(r.end_time),
                    timed: true,
                }));
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
                this.diary.server(
                    this.server_active ? this.server_url : '',
                    this.server_start == 'start',
                    0,
                    () => this.online_backup_failed = true
                );
            }
        },
        online_backup_cancel() {
            this.server_active = this.server_active_on_cancel;
            this.online_backup_dialog = false;
        },
        online_backup_ok() {
            this.server_active = !!this.server_url;
            this.online_backup_dialog = false;
            this.diary.server(
                this.server_url,
                this.server_start == 'start',
                0,
                () => this.online_backup_failed = true
            );
        },

        sleep_planning_switch() {
            this.sleep_planning_dialog = this.target_active;
            if ( !this.target_active ) {
                this.diary.add_entry('RETARGET');
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
            this.diary.preferred_day_length(preferred_day_length);
            this.diary.add_entry('RETARGET',new Date().getTime(),target);
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
        this.reset_diary();
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

        window.onerror = (message,source,lineno,colno) => {
            this.debug_messages.push([message,source,lineno,colno]);
            return false;
        }

    },

});
