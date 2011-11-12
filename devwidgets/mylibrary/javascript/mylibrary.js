/*
 * Licensed to the Sakai Foundation (SF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The SF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * specific language governing permissions and limitations under the License.
 */

// load the master sakai object to access all Sakai OAE API methods
require(["jquery", "sakai/sakai.api.core"], function($, sakai) {

    /**
     * @name sakai_global.mylibrary
     *
     * @class mylibrary
     *
     * @description
     * Widget that lists all of the content items that live inside of a given
     * library
     *
     * @param {String} tuid Unique id of the widget
     * @param {Boolean} showSettings Show the settings of the widget or not
     */
    sakai_global.mylibrary = function (tuid, showSettings, widgetData, state) {

        /////////////////////////////
        // Configuration variables //
        /////////////////////////////

        var mylibrary = {  // global data for mylibrary widget
            sortBy: "_lastModified",
            sortOrder: "desc",
            isOwnerViewing: false,
            default_search_text: "",
            userArray: [],
            contextId: false,
            infinityScroll: false,
            widgetShown: true
        };

        // DOM jQuery Objects
        var $rootel = $("#" + tuid);  // unique container for each widget instance
        var $mylibrary_check = $(".mylibrary_check", $rootel);
        var $mylibrary_items = $("#mylibrary_items", $rootel);
        var $mylibrary_check_all = $("#mylibrary_check_all", $rootel);
        var $mylibrary_remove = $("#mylibrary_remove", $rootel);
        var $mylibrary_sortby = $("#mylibrary_sortby", $rootel);
        var $mylibrary_livefilter = $("#mylibrary_livefilter", $rootel);
        var $mylibrary_livefilter_container = $("#mylibrary_livefilter_container", $rootel);
        var $mylibrary_sortarea = $("#mylibrary_sortarea", $rootel);
        var $mylibrary_empty = $("#mylibrary_empty", $rootel);
        var $mylibrary_admin_actions = $("#mylibrary_admin_actions", $rootel);
        var $mylibrary_addcontent = $("#mylibrary_addcontent", $rootel);
        var $mylibrary_remove_icon = $(".mylibrary_remove_icon", $rootel);
        var $mylibrary_search_button = $("#mylibrary_search_button", $rootel);

        var currentGroup = false;

        ///////////////////////
        // Utility functions //
        ///////////////////////

        /**
         * Get personalized text for the given message bundle key based on
         * whether this library is owned by the viewer, or belongs to someone else.
         * The message should contain a '${firstname}' variable to replace with
         * and be located in this widget's properties files.
         *
         * @param {String} bundleKey The message bundle key
         */
        var getPersonalizedText = function (bundleKey) {
            if(currentGroup){
                return sakai.api.i18n.getValueForKey(
                    bundleKey, "mylibrary").replace(/\$\{firstname\}/gi,
                        currentGroup.properties["sakai:group-title"]);
            } else if (mylibrary.isOwnerViewing) {
                return sakai.api.i18n.getValueForKey(
                    bundleKey, "mylibrary").replace(/\$\{firstname\}/gi,
                        sakai.api.i18n.getValueForKey("YOUR").toLowerCase());
            } else {
                return sakai.api.i18n.getValueForKey(bundleKey, "mylibrary").replace(/\$\{firstname\}/gi, sakai.api.User.getFirstName(sakai_global.profile.main.data) + "'s");
            }
        };

        /**
         * Bring all of the topbar items (search, checkbox, etc.) back into its original state
         */
        var resetView = function(){
            $mylibrary_check_all.removeAttr("checked");
            $mylibrary_remove.attr("disabled", "disabled");
            $("#mylibrary_title_bar").show();
        };

        /**
         * Show or hide the controls on the top of the library (search box, sort, etc.)
         * @param {Object} show    True when you want to show the controls, false when
         *                         you want to hide the controls
         */
        var showHideTopControls = function(show){
            if (show){
                if (mylibrary.isOwnerViewing) {
                    $mylibrary_admin_actions.show();
                }
                $mylibrary_livefilter_container.show();
                $mylibrary_sortarea.show();
            } else {
                $mylibrary_admin_actions.hide();
                $mylibrary_livefilter_container.hide();
                $mylibrary_sortarea.hide();
            }
        };

        /////////////////////////////
        // Deal with empty library //
        /////////////////////////////

        /**
         * Function that manages how a library with no content items is handled. In this case,
         * the items container will be hidden and a "no items" container will be shown depending
         * on what the current context of the library is
         */
        var handleEmptyLibrary = function(){
            resetView();
            $mylibrary_items.hide();
            var query = $mylibrary_livefilter.val();
            // We only show the controls when there is a search query. 
            // All other scenarios with no items don't show the top controls
            if (!query){
                showHideTopControls(false);
            } else {
                showHideTopControls(true);
            }
            // Determine the state of the current user in the current library
            var mode = "user_me";
            if (sakai_global.profile && mylibrary.contextId !== sakai.data.me.user.userid) {
                mode = "user_other";
            } else if (!sakai_global.profile && mylibrary.isOwnerViewing) {
                mode = "group_managed";
            } else if (!sakai_global.profile) {
                mode = "group";
            }
            $mylibrary_empty.html(sakai.api.Util.TemplateRenderer("mylibrary_empty_template", {
                mode: mode,
                query: query
            }));
            $mylibrary_empty.show();
        }

        ////////////////////
        // Load a library //
        ////////////////////

        /**
         * Load the items of the current library and start an infinite scroll on
         * them
         */
        var showLibraryContent = function () {
            resetView();
            var query = $mylibrary_livefilter.val() || "*";
            // Disable the previous infinite scroll
            if (mylibrary.infinityScroll){
                mylibrary.infinityScroll.kill();
            }
            // Set up the infinite scroll for the list of items in the library
            mylibrary.infinityScroll = $mylibrary_items.infinitescroll("/var/search/pool/manager-viewer.json", {
                userid: mylibrary.contextId,
                sortOn: mylibrary.sortBy,
                sortOrder: mylibrary.sortOrder,
                q: query
            }, function(items, total){
                return sakai.api.Util.TemplateRenderer("mylibrary_items_template", {
                    "items": items,
                    "sakai": sakai
                });
            }, handleEmptyLibrary, sakai.config.URL.INFINITE_LOADING_ICON, handleLibraryItems, sakai.api.Content.getNewList(mylibrary.contextId));
        };

        ////////////////////
        // State handling //
        ////////////////////

        /**
         * Deal with changed state in the library. This can be triggered when
         * a search was initiated, sort was changed, etc.
         */
        var handleHashChange = function(e) {
            if (mylibrary.widgetShown){
                // Set the sort states
                var parameters = $.bbq.getState();
                mylibrary.sortOrder = parameters["lso"] || "desc";
                mylibrary.sortBy = parameters["lsb"] || "_lastModified";
                $mylibrary_livefilter.val(parameters["lq"] || "");
                $mylibrary_sortby.val("lastModified_" + mylibrary.sortOrder);
                showLibraryContent();
            }
        };

        ////////////////////
        // Search library //
        ////////////////////

        /**
         * Search the current library. This function will extract the query
         * from the search box directly.
         */
        var doSearch = function(){
            var q = $.trim($mylibrary_livefilter.val());
            if (q) {
                $.bbq.pushState({ "lq": q });
            } else {
                $.bbq.removeState("lq");
            }
        };

        ////////////////////
        // Event Handlers //
        ////////////////////

        /**
         * Enable/disable the remove selected button depending on whether
         * any items in the library are checked
         */
        $mylibrary_check.live("change", function (ev) {
            if ($(this).is(":checked")) {
                $mylibrary_remove.removeAttr("disabled");
            } else if (!$(".mylibrary_check:checked", $rootel).length) {
                $mylibrary_remove.attr("disabled", "disabled");
            }
        });

        /**
         * Check/uncheck all loaded items in the library
         */
        $mylibrary_check_all.change(function (ev) {
            if ($(this).is(":checked")) {
                $(".mylibrary_check").attr("checked", "checked");
                $mylibrary_remove.removeAttr("disabled");
            } else {
                $(".mylibrary_check").removeAttr("checked");
                $mylibrary_remove.attr("disabled", "disabled");
            }
        });

        /**
         * Gather all selected library items and initiate the
         * deletecontent widget
         */
        $mylibrary_remove.click(function (ev) {
            var $checked = $(".mylibrary_check:checked:visible", $rootel);
            if ($checked.length) {
                var paths = [];
                $checked.each(function () {
                    paths.push(this.id.split("mylibrary_check_")[1]);
                });
                $(window).trigger('init.deletecontent.sakai', [{
                    paths: paths,
                    context: mylibrary.contextId
                }, function (success) {
                    if (success) {
                        resetView();
                        $(window).trigger("lhnav.updateCount", ["library", -(paths.length)]);
                        mylibrary.infinityScroll.removeItems(paths);
                    }
                }]);
            }
        });

        /**
         * Called when clicking the remove icon next to an individual content
         * item
         */
        $mylibrary_remove_icon.live("click", function(ev) {
            if ($(this).attr("data-entityid")){
                var paths = [];
                paths.push($(this).attr("data-entityid"));
                $(window).trigger('init.deletecontent.sakai', [{
                    paths: paths,
                    context: mylibrary.contextId
                }, function (success) {
                    if (success) {
                        resetView();
                        $(window).trigger("lhnav.updateCount", ["library", -(paths.length)]);
                        mylibrary.infinityScroll.removeItems(paths);
                    }
                }]);
            }
        });

        /**
         * Reload the library list based on the newly selected
         * sort option
         */
        $mylibrary_sortby.change(function (ev) {
            var query = $.trim($mylibrary_livefilter.val());
            var sortSelection = $(this).val();
            var sortBy = "_lastModified",
                sortOrder = "desc";
            if (sortSelection === "lastModified_asc") {
                sortOrder = "asc";
            }
            $.bbq.pushState({"lsb": sortBy, "lso": sortOrder, "lq": query});
        });

        /**
         * Initiate a library search when the enter key is pressed
         */
        $mylibrary_livefilter.keyup(function (ev) {
            if (ev.keyCode === 13) {
                doSearch();
            }
            return false;
        });

        /**
         * Initiate a search when the search button next to the search
         * field is pressed
         */
        $mylibrary_search_button.click(doSearch);

        /**
         * Initiate the add content widget
         */
        $mylibrary_addcontent.click(function (ev) {
            $(window).trigger("init.newaddcontent.sakai");
            return false;
        });

        /**
         * Listen for newly the newly added content or newly saved content
         * @param {Object} data        Object that contains the new library items
         * @param {Object} library     Context id of the library the content has been added to
         */ 
        $(window).bind("done.newaddcontent.sakai", function(e, data, library) {
            if (library === mylibrary.contextId) {
                mylibrary.infinityScroll.prependItems(data);
            }
        });

        /**
         * Keep track as to whether the current library widget is visible or not. If the
         * widget is not visible, it's not necessary to respond to hash change events.
         */
        $(window).bind(tuid + ".shown.sakai", function(e, shown){
            mylibrary.widgetShown = shown;
        });
        /**
         * Bind to hash changes in the URL
         */
        $(window).bind("hashchange", handleHashChange);

        ////////////////////////////////////////////
        // Data retrieval and rendering functions //
        ////////////////////////////////////////////

        /**
         * Formats a tag list from the server for display in the UI
         *
         * @param {Array} tags  an array of tags from the server
         * @return {Array} an array of tags formatted for the UI
         */
        var formatTags = function (tags) {
            if (!tags) {
                return null;
            }
            var formatted_tags = [];
            $.each(sakai.api.Util.formatTagsExcludeLocation(tags), function (i, name) {
                formatted_tags.push({
                    name: name,
                    link: "search#q=" + sakai.api.Util.safeURL(name)
                });
            });
            return formatted_tags;
        };

        /**
         * Determines whether the current user can delete a content object from the
         * library. This can happen if the user/group that owns the library is either
         * a direct manager or direct viewer of the item
         * @param {Object} item    Content item object
         */
        var canDeleteContent = function(item){
            var canDelete = false;
            if (!mylibrary.isOwnerViewing){
                return false;
            }
            if (item["sakai:pooled-content-viewer"]){
                for (var v = 0; v < item["sakai:pooled-content-viewer"].length; v++){
                    if (item["sakai:pooled-content-viewer"][v] === mylibrary.contextId){
                        canDelete = true;
                    }
                }
            }
            if (item["sakai:pooled-content-manager"]){
                for (var m = 0; m < item["sakai:pooled-content-manager"].length; m++){
                    if (item["sakai:pooled-content-manager"][m] === mylibrary.contextId){
                        canDelete = true;
                    }
                }
            }
            return canDelete;
        };

        /**
         * Process library item results from the server
         */
        var handleLibraryItems = function (results, callback) {
            var userIds = [];
            $.each(results, function(index, content){
                userIds.push(content["sakai:pool-content-created-for"] || content["_lastModifiedBy"]);
            });
            if (userIds.length) {
                sakai.api.User.getMultipleUsers(userIds, function(users){
                    var currentItems = [];
                    $.each(results, function(i, result){
                        var mimetypeObj = sakai.api.Content.getMimeTypeData(result["_mimeType"]);
                        currentItems.push({
                            id: result["_path"],
                            filename: result["sakai:pooled-content-file-name"],
                            link: "/content#p=" + sakai.api.Util.safeURL(result["_path"]),
                            last_updated: $.timeago(new Date(result["_lastModified"])),
                            type: sakai.api.i18n.getValueForKey(mimetypeObj.description),
                            type_src: mimetypeObj.URL,
                            ownerid: result["sakai:pool-content-created-for"],
                            ownername: sakai.data.me.user.userid === result["sakai:pool-content-created-for"] ? sakai.api.i18n.getValueForKey("YOU") : sakai.api.User.getDisplayName(users[result["sakai:pool-content-created-for"]]),
                            tags: formatTags(result["sakai:tags"]),
                            numPlaces: sakai.api.Content.getPlaceCount(result),
                            numComments: sakai.api.Content.getCommentCount(result),
                            mimeType: result["_mimeType"],
                            thumbnail: sakai.api.Content.getThumbnail(result),
                            description: sakai.api.Util.applyThreeDots(result["sakai:description"], 1300, {
                                max_rows: 1,
                                whole_word: false
                            }, "searchcontent_result_course_site_excerpt"),
                            fullResult: result,
                            canDelete: canDeleteContent(result)
                        });
                        mylibrary.userArray.push(result["sakai:pool-content-created-for"]);
                    });
                    callback(currentItems);
                });
                showHideTopControls(true);
                $mylibrary_empty.hide();
                $mylibrary_items.show();
            } else {
                callback([]);
            }
        };

        /////////////////////////////
        // Initialization function //
        /////////////////////////////

        /**
         * Initialization function that is run when the widget is loaded. Determines
         * which mode the widget is in (settings or main), loads the necessary data
         * and shows the correct view.
         */
        var doInit = function () {
            mylibrary.contextId = "";
            var contextName = "";
            var isGroup = false;

            // We embed the deletecontent widget, so make sure it's loaded
            sakai.api.Widgets.widgetLoader.insertWidgets(tuid, false);

            if (widgetData && widgetData.mylibrary) {
                mylibrary.contextId = widgetData.mylibrary.groupid;
                sakai.api.Server.loadJSON("/system/userManager/group/" +  mylibrary.contextId + ".json", function(success, data) {
                    if (success){
                        currentGroup = data;
                        contextName = currentGroup.properties["sakai:group-title"];
                        isGroup = true;
                        mylibrary.isOwnerViewing = sakai.api.Groups.isCurrentUserAManager(currentGroup.properties["sakai:group-id"], sakai.data.me, currentGroup.properties);
                        finishInit(contextName, isGroup);
                    }
                });
            } else {
                mylibrary.contextId = sakai_global.profile.main.data.userid;
                contextName = sakai.api.User.getFirstName(sakai_global.profile.main.data);
                if (mylibrary.contextId === sakai.data.me.user.userid) {
                    mylibrary.isOwnerViewing = true;
                }
                finishInit(contextName, isGroup);
            }
        };

        /**
         * Additional set-up of the widget
         */
        var finishInit = function(contextName, isGroup){
            if (mylibrary.contextId) {
                mylibrary.default_search_text = getPersonalizedText("SEARCH_YOUR_LIBRARY");
                mylibrary.currentPagenum = 1;
                var all = state && state.all ? state.all : {};
                handleHashChange(null, true);
                sakai.api.Util.TemplateRenderer("mylibrary_title_template", {
                    isMe: mylibrary.isOwnerViewing,
                    isGroup: isGroup,
                    user: contextName
                }, $("#mylibrary_title_container", $rootel));
            } else {
                debug.warn("No user found for My Library");
            }
        };

        // run the initialization function when the widget object loads
        doInit();

    };

    // inform Sakai OAE that this widget has loaded and is ready to run
    sakai.api.Widgets.widgetLoader.informOnLoad("mylibrary");
});
