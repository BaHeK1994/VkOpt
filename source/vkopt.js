// ==UserScript==
// @name          VKOpt 3.x
// @author        KiberInfinity( /id13391307 )
// @namespace     http://vkopt.net/
// @description   Vkontakte Optimizer 3.x
// @include       *vkontakte.ru*
// @include       *vk.com*
// ==/UserScript==
//
// (c) All Rights Reserved. VkOpt.
//
/* VERSION INFO */
var vVersion	= 233;
var vBuild = 160422;
var vPostfix = ' ';

if (!window.vkopt) window.vkopt={};

var vkopt_defaults = {
   config: {
      scroll_to_next: false,
      ad_block: true,
      compact_audio: false,
      disable_border_radius: false,
      audio_dl: true,
      audio_size_info: false,
      audio_clean_titles: false,
      size_info_on_ctrl: true,
      scrobbler: true,
      im_dialogs_right: false,
      
      //Extra:
      photo_replacer: true,
      add_to_next_fix: true, // кнопка "Воспроизвести следующей" теперь добавляет в текущий список воспроизведения из посторонних
      audio_more_acts: true, // доп. менюшка для каждой аудиозаписи
      audio_dl_acts_2_btns: false, // разделить на аудио кнопки скачивания и меню доп.действий 
      audio_edit_box_album_selector: true, // поле выбора альбома в окне редактирования названия аудио
      im_hide_dialogs: false,
      
      //Consts:
      AUDIO_INFO_LOAD_THREADS_COUNT: 5,
      AUTO_LIST_DRAW_ROWS_INJ: true, // На случай, если инъекция будет убивать редер автоподгружаемых списков
      MAX_CACHE_AUDIO_SIZE_ITEMS: 10000 // максимальное количество запомненных размеров аудио в локальном хранилище
   }
}

var vkopt_core = {
   disallow_location: /\/m\.vk\.com|login\.vk\.com|oauth\.vk\.com|al_index\.php|frame\.php|widget_.+php|notifier\.php|audio\?act=done_add/i,
   dom_ready: function(fn, ctx){
      var ready, timer;
      var onChange = function (e) {
         if (!window.IDL || !window.VK_LANGS) return; // Ждём vk_lib.js и vklang.js
         if (document.getElementById('footer') || document.getElementById('footer_wrap')) {
            fireDOMReady();
         } else if (e && e.type == "DOMContentLoaded") {
            fireDOMReady();
         } else if (e && e.type == "load") {
            fireDOMReady();
         } else if (document.readyState) {
            if ((/loaded|complete/).test(document.readyState)) {
               fireDOMReady();
            } else if (!!document.documentElement.doScroll) {
               try {
                  ready || document.documentElement.doScroll('left');
               } catch (e) {
                  return;
               }
               fireDOMReady();
            }
         }
      };
      var fireDOMReady = function () {
         if (!ready) {
            ready = true;
            fn.call(ctx || window);
            if (document.removeEventListener)
               document.removeEventListener("DOMContentLoaded", onChange, false);
            document.onreadystatechange = null;
            window.onload = null;
            clearInterval(timer);
            timer = null;
         }
      };
      if (document.addEventListener)
         document.addEventListener("DOMContentLoaded", onChange, false);
      document.onreadystatechange = onChange;
      timer = setInterval(onChange, 5);
      window.onload = onChange;
   },
   init: function(){
      if (vkopt_core.disallow_location.test(document.location.href)) return;
      //TODO: тут ещё бы дождаться подгрузки vk_lib.js
      vkopt_core.dom_ready(function(){
         if (!isNewVk()) return;
         console.log('init vkopt 3.x');
         vkopt_core.run();
      }); 
   },
   run: function(){
      for (var key in StaticFiles)  
         if (StaticFiles[key].t == 'js')
            vk_glue.inj_to_file(key); 
      vkBroadcast.Init(vkOnStorage);
      vkopt_core.plugins.on_init();
      vk_glue.nav_handler();
      window.vkopt_core_ready = true;
      vkCheckUpdates();
   },
   
   mod_str_as_node: function(str, func, params){
      if (!str || str.tagName)
         return str;
      var is_table = str.substr(0,3)=='<tr';
      var div = vkCe(is_table?'table':'div');
      div.innerHTML = str;
      func(div,params);
      var txt = div.innerHTML;
      if (is_table && txt.substr(0,7) == "<tbody>")
         txt = txt.substr(7,txt.length-15);
      return txt;
      //TODO: call to plugins 
   }, 
   setLoc: function(new_location){  // использовать вместо nav.setLoc для избежания рекурсии, обход реакции на смену URL'а
      nav.setLoc(new_location,'vkopt');
   },
   plugins: {
      delayed_run: function(plug_id){ //функция для пуска отдельного плагина, который не был подключен до основного запуска вкопта
         var css = vkopt_core.plugins.get_css(plug_id);
         if (css != '') 
            vkaddcss(code);
         
         vkopt_core.plugins.call_method(plug_id, 'onInit');
         vkopt_core.plugins.call_modules('onModuleDelayedInit', plug_id); // сообщаем всем модулям о подключении опоздавшего
         
         for (var key in StaticFiles) 
            if (StaticFiles[key].t == 'js')
               vkopt_core.plugins.call_method(plug_id, 'onLibFiles', key);
            
         vkopt_core.plugins.call_method(plug_id, 'onLocation', nav.objLoc, cur.module);
         vkopt_core.plugins.call_method(plug_id, 'processNode', null, {source:'delayed_run'});
      },
      call_method: function(){ // (plug_id, method, arg1, arg2 ...)
         var args = Array.prototype.slice.call(arguments);
         var plug_id = args.shift();
         var method = args.shift();
         var field = vkopt[plug_id][method];
         if (field) // TODO: && isModuleEnabled(plug_id)
            return isFunction(field) ? field.apply(this, args) : field; 
         return null;
      },
      call_modules: function(){ // (method, arg1, arg2 ...)
         var args = Array.prototype.slice.call(arguments);
         var results = {};
         for (var plug_id in vkopt){
            var res = vkopt_core.plugins.call_method.apply({plugin_id:plug_id}, [plug_id].concat(args));
            if (res) results[plug_id] = res;
         }
         return results;
      },
      on_init:function(){
         vkopt_core.plugins.add_css();
         vkopt_core.plugins.call_modules('onInit');
         vkopt_core.plugins.process_node(ge('page_body'));
      },
      add_css:function(){
         var code = '';
         for (var plug_id in vkopt)
            code += vkopt_core.plugins.get_css(plug_id);
         vkaddcss(code);
      },
      get_css:function(plug_id){
         var css = vkopt[plug_id].css;
         if (!css) return '';
         return (Object.prototype.toString.call(css) === '[object Function]')?css():css;
      },
      on_js_file: function(file){
         //console.log('on *.js: '+file);
         vkopt_core.plugins.call_modules('onLibFiles', file);
      },
      on_location: function(){
         //console.log('on nav: ', cur.module, ' obj: ', JSON.stringify(nav.objLoc)); 
         vkopt_core.plugins.call_modules('onLocation', nav.objLoc, cur.module);
      },
      on_storage: function(id, cmd){ // listen messages for communicate between tabs
         vkopt_core.plugins.call_modules('onStorage', id, cmd);
      },
      process_response: function(answer, url, q){
         var _rx = /^\s*<(div|table|input|a)/i;
         for (var i=0;i<answer.length;i++){
            if (typeof answer[i]=='string' && _rx.test(answer[i]) ){
               answer[i] = vkopt_core.mod_str_as_node(answer[i], vkopt_core.plugins.process_node, {source:'process_response', url:url, q:q});
            }
         }
         vkopt_core.plugins.call_modules('onResponseAnswer', answer,url,q);
      },
      process_node: function(node, params){
         node = node || ge('content');
         var nodes=node.getElementsByTagName('a'); 
         for (var i=0;i<nodes.length;i++)
            vkopt_core.plugins.process_links(nodes[i],params);
         //if (params && params.source = 'process_response' )
         vkopt_core.plugins.call_modules('processNode', node, params);
      },
      process_links:function(link_el, params){
         vkopt_core.plugins.call_modules('processLinks', link_el, params);
      }
   }
}

var vk_glue = {
   inj_handler: function(files){ // call from stManager.add(files, callback, async)  ->   vk_glue.inj_handler(files)
      return function(no_pending){
         if (no_pending)
            console.log('no need inject?', files)
            
         if (!isArray(files)) files = [files];
         for (var i in files){
            if (files[i].indexOf('.js') != -1) 
               vk_glue.inj_to_file(files[i]);
         }
      }
   },
   inj_to_file: function(file_name){
      switch (file_name){
         case 'common.js':       vk_glue.inj.common();  break;
         case 'auto_list.js':       vk_glue.inj.auto_list();  break;
      }
      vkopt_core.plugins.on_js_file(file_name); 
   },
   inj: {
      common: function(){
         // перехватываем момент подключения скриптов:
         Inj.BeforeR("stManager.add",/__stm._waiters.push\(\[([^,]+)/,"__stm._waiters.push([$1, vk_glue.inj_handler(#ARG0#)]);");
         
         // следующая строка не факт что нужна (а может оптимизированней будет, если её убрать), т.к она срабатывает только если у нас нет списка ожидания, 
         // т.е скрипты были ранее уже подгружены на страницу, и инъекции вероятно остались на месте.
         //Inj.BeforeR("stManager.add",/(if\s*\(![a-zA-z_]+.length\))/,"$1{vk_glue.inj_handler(#ARG0#)(true);}"); //"_matched_{vk_glue.inj...
         
         // перехват события об аякс загрузке новой страницы / смене URL'а
         Inj.End('nav.setLoc',';\nif (arguments[1]!="vkopt") setTimeout(vk_glue.nav_handler,2);\n');
         

         // Перехватываем результат ajax-запросов с возможностью модификации перед колбеком
         Inj.Start('ajax._post', 
            // ARG0 - url; ARG1 - query object; ARG2 - options
            function(){
               // Mod callback:
               if (__ARG2__.onDone){
                  var onDoneOrig = __ARG2__.onDone;
                  __ARG2__.onDone = function(){
                     vk_glue.response_handler(arguments, __ARG0__, __ARG1__);
                     onDoneOrig.apply(window, arguments);
                  }
               }
               // End of callback mod
            }
         );
         // айфремовая загрузка выглядит так - загрузили каркас с частью данных, дальше по ходу загрузки айфреймовой страницы выполняются куски заполнения элементов карскаса.
         // эти кучки тоже надо перехватывать.
         Inj.Start('ajax.framegot','if (#ARG1#) #ARG1#=vk_glue.process_on_framegot(#ARG1#);'); 
         /*
         Inj.Start('ajax.post','if (vkAllowPost(url, query, options)==false) return;');
         Inj.Start('renderFlash','vkOnRenderFlashVars(vars);');
         */
      },
      auto_list: function(){
         if (vkopt_defaults.config.AUTO_LIST_DRAW_ROWS_INJ){
            Inj.Replace('AutoList.prototype._drawRows',/\.appendChild\(([A-Za-z_0-9]+)\)/,'$&; vkopt_core.plugins.process_node($1);');
         }
         // Inj.End('AutoList.prototype._drawRows', '; vkopt_core.plugins.process_node(this._containerEl);'); // Другой вариант. Меньше шансов того, что отвалится, но тут выходит повторная обработка ранее выведенного.
      }
   },
   nav_handler: function(){
      // тут какие-то системные действия движка до передачи события в плагины
      // ...
      vkopt_core.plugins.on_location();
   },
   process_on_framegot: function(html){
      return vkopt_core.mod_str_as_node(html, vkopt_core.plugins.process_node);
   },
   response_handler: function(answer,url,q){
      vkopt_core.plugins.process_response(answer, url, q);
   }
}

/*
(function(){
   var m = {
      id: 'vkopt_any_plugin',
      // <core>
      onInit:                 function(){},                                // выполняется один раз после загрузки стрницы
      onLibFiles:             function(file_name){},                       // место для инъекций = срабатывает при подключении нового js-файла движком контакта.
      onLocation:             function(nav_obj,cur_module_name){},         // вызывается при переходе между страницами
      onResponseAnswer:       function(answer,url,params){},               // answer - массив, изменять только его элементы
      onStorage :             function(command_id,command_obj){},          // слушает сообщения отосланные из других вкладок вк через vkCmd(command_id,command_obj)
      processNode:            function(node, params){}                     // обработка элемента
      processLinks:           function(link, params){},                    // обработка ссылки
      onModuleDelayedInit:    function(plugin_id){},                       // реакция на подключение модуля, опоздавшего к загрузке страницы.
      
      // <settings>
      onSettings:             function(){} || {}                           // возвращаем объект с перечисленными по категориям настройками этого модуля
      onOptionChanged:        function(option_id, val, option_data){},     // реакция на изменение опции
      
      // <audio>
      onAudioRowMenuItems: function(audio_info_obj){},                     // вернуть массив из строк с пунктами-ссылками "<a>..</a>"
   };
   window.vkopt = (window.vkopt || {});
   window.vkopt[m.id] = m;
   if (window.vkopt_core_ready) vkopt_core.plugins.delayed_run(m.id);      // запускает модуль, если мы опоздали к загрузке страницы, провоцирует вызов события onModuleDelayedInit
})();
*/

vkopt['settings'] =  {
   tpls: null,
   css: function(){
      return vk_lib.get_block_comments(function(){
         /*settings_css:
         .vk_settings_block .checkbox{
            margin-top: 10px
         }
         .vk_settings_block .checkbox:first-child {
            margin-top: 0
         }
         .vk_sub_options{padding-left:20px; margin-top:5px;}
         */
      }).settings_css;

   },
   onInit: function(){
      // <UI>
      vkopt.settings.__full_title = vk_lib.format('Vkontakte Optimizer %1<sup><i>%2</i></sup> (build %3)', String(vVersion).split('').join('.'), vPostfix, vBuild);
      var values = {
         full_title: vkopt.settings.__full_title
      };
      // Кто-то что-то имеет против против такого пожирания ресурсов, в обмен на более удобное описание больших кусков текста? (и да, я в курсе, что это создаст проблем в случае минимизации)
      vkopt.settings.tpls = vk_lib.get_block_comments(function(){
         /*right_menu_item:
         <a id="ui_rmenu_vkopt" href="/settings?act=vkopt" class="ui_rmenu_item _ui_item_payments" onclick="return vkopt.settings.show(this);"><span>{lng.VkOpt}</span></a>
         */
         
         /*main:
         <div id="vkopt_settings_block" class="page_block clear_fix">
             <div class="page_block_header">{vals.full_title}</div>
             <div id="vkopt_settings" class="settings_panel clear_fix">
                <div class="settings_line">
                  Comming soon! <!--☑ Check Me!--!>
                  <!--CODE--!>   
                </div>
             </div>
         </div>         
         */
         /*cat_block:
         <div class="settings_line" id="vk_setts_{vals.cat}">
            <div class="settings_label">{vals.caption}</div>
            <div class="settings_labeled_text vk_settings_block">{vals.content}</div>
         </div>
         */
         
         /*checkbox:
         <div class="checkbox {vals.on_class}" id="vkcfg_{vals.id}" onclick="checkbox(this); vkopt.settings.set('{vals.id}', isChecked(this));">{vals.caption}</div>       
         */
         /*radiobtn:
         <div class="radiobtn {vals.on_class}" data-val="{vals.value}" onclick="radiobtn(this, '{vals.value}', '{vals.id}'); vkopt.settings.set('{vals.id}', '{vals.value}');">{vals.caption}</div>
         */ 
         /*sub_block:
         <div class="vk_sub_options">{vals.content}</div>
         */
         
         /* Usage as
         
         <div class="radiobtn on" data-val="0" onclick="radiobtn(this, 0, 'im_submit')">
            <b>Enter</b> — отправка сообщения<br><b>Shift+Enter</b> — перенос строки
         </div>  
         
         radioBtns.im_submit = {
                           els : Array.prototype.slice.apply(geByClass("radiobtn", ge("im_submit_hint_opts"))),
                           val : e
                        };
         */
      });
      // Подставляем локализацию в шаблон:
      for (var key in vkopt.settings.tpls)
         vkopt.settings.tpls[key] = vk_lib.tpl_process(vkopt.settings.tpls[key],values);
      
      vkopt.settings.top_menu_item();
      // </UI>
      
      // Инит фич настроек плагинов
      var list = vkopt.settings.get_options_list();
      vkopt.settings.init_features(list);
   },
   onLocation: function(nav_obj,cur_module_name){
      if (nav_obj[0] != 'settings') return;
      if (!ge('ui_rmenu_vkopt')){
         var item = se(vkopt.settings.tpls.right_menu_item);
         var p = (ge('ui_rmenu_general') || {}).parentNode;
         p && p.appendChild(item);
      }
      if (nav_obj.act == 'vkopt'){
         Inj.Wait('cur.module == "settings"',function(){ // для предотвращения фейла родных скриптов
            vkopt.settings.show();
         },100)
      }
   },
   onModuleDelayedInit: function(plug_id){
      var list = vkopt_core.plugins.call_method(plug_id, 'onSettings');
      vkopt.settings.init_features(list, plug_id);
   },
   init_features: function(list, plug_id){
      
      var each_in_opts = function(list){
         for (var option_id in list){
            var option_data = list[option_id];
            if (plug_id){
               option_data.plug_id = plug_id;      // TODO: убрать дублирование кода. (второй дубль в get_options_list)
               option_data.id = option_id;
            }
            vkopt.settings.set_feature(option_data, vkopt.settings.get(option_data.id));
            
            if (list[option_id].sub)              // обходим вложенные опции.
               each_in_opts(list[option_id].sub);
         }
         return null;
      }
      for (var cat in list){
         each_in_opts(list[cat]);
      }         
   },
   top_menu_item: function(){
      var ref = ge('top_support_link');
      var item = se('<a class="top_profile_mrow" id="top_vkopt_settings_link" href="/settings?act=vkopt" onclick="return vkopt.settings.show(this, true);">VkOpt</a>');
      if (ref && !ge('top_vkopt_settings_link')){
         ref.parentNode.insertBefore(item, ref);
      }
   },
   show: function(el, in_box){
      var list = vkopt.settings.get_options_list();
      var html = '';
      for (var cat in list){
         var content = '';
         for (var option_id in list[cat]){
            content += vkopt.settings.get_switcher_code(list[cat][option_id]);
         }
         
         html += vk_lib.tpl_process(vkopt.settings.tpls['cat_block'], {
               caption: IDL(cat, 2),
               content: content,
               cat: cat
            });         
         
      }
      console.log(list);
      var p = null;
      if (!in_box){
         el = el || ge('ui_rmenu_vkopt');
         el && uiRightMenu.switchMenu(el);
         p = ge('wide_column');
         vkopt_core.setLoc('settings?act=vkopt'); // вместо nav.setLoc для избежания рекурсии, обход реакции на смену URL'а
         p.innerHTML = vkopt.settings.tpls['main'];
         ge('vkopt_settings').innerHTML = html;         
      } else {
         stManager.add('settings.css',function(){
            vkopt.settings.__box = new MessageBox({title:vkopt.settings.__full_title, width: 650 ,hideButtons:true}).content(html).show();        
         })
       
      }

      // vkopt.settings.prepare_radiobtns();
      return false;
   },
   config: function(new_config){
      if (new_config){
         localStorage['vkopt_config'] = JSON.stringify(new_config);
         return new_config;
      }
      var config = vkopt_defaults.config;
      try {
         config = JSON.parse(localStorage['vkopt_config'] || '{}')
      } catch(e) {
         new MessageBox({title:'Vkopt error',hideButtons:true}).content('Config parse error. Use default config').show();
         localStorage['vkopt_config'] = JSON.stringify(config);
         // TODO: add ping to statisitcs about fail
      }
      return config;      
   },
   set:function(option_id, val){
      var cfg = vkopt.settings.config();
      cfg[option_id] = val;
      vkopt.settings.config(cfg);
      
      var option_data = vkopt.settings.get_option_data(option_id);
      vkopt.settings.set_feature(option_data, val);
      
      vkopt_core.plugins.call_modules('onOptionChanged', option_id, val, option_data);
   },
   get:function(option_id){
      var cfg = vkopt.settings.config();
      return (typeof cfg[option_id] == 'undefined') ? vkopt_defaults.config[option_id] : cfg[option_id];
   },

   get_option_data: function(option_id){
      var list = vkopt.settings.get_options_list();
      var option_data = null;
      var each_in_opts = function(list){
         for (var opt_id in list){
            if (opt_id == option_id)
               return list[opt_id];
            
            if (list[opt_id].sub){              // ищем среди вложенных опций.
               var data = each_in_opts(list[opt_id].sub);
               if (data)
                  return data;
            }
         }
         return null;
      }
      for (var cat in list){
         var option_data = each_in_opts(list[cat]);
         if (option_data)
            return option_data
      }
   },
   set_feature: function(option_data, val){
      if (!option_data) return;
      if (option_data.class_toggler) // если опция переключает наличие css-класса применяемого ко всей странице
         (val ? addClass : removeClass)(geByTag1('html'), 'vk_'+option_data.id);// у <body> className порой полностью перезаписывается обработчиками вк, т.ч вешаем класс на <html>
   },
   
   get_options_list:function(){
      var raw_list = vkopt_core.plugins.call_modules('onSettings'); // собираем опции со всех плагинов в один список
      var options = {};
      var options_id = {}; // <conflicts />
      
      var each_in_cat = function(plug_id, opts, options, cat){
            for (var option_id in opts){
               var option_data = opts[option_id];
               option_data.plug_id = plug_id;
               option_data.id = option_id;
               if (options && cat)
                  options[cat][option_id] = option_data; 
               
               // <conflicts>
               if (!options_id[option_id]) // собираем инфу, чтоб потом проверить, нет ли повторов ID опций в других плагинах
                  options_id[option_id] = []
               options_id[option_id].push(plug_id);
               // </conflicts>
               if (option_data.sub){
                  each_in_cat(plug_id, option_data.sub);
               }
            }         
      }
      for (var plug_id in raw_list){
         var setts = raw_list[plug_id];
         for (var cat in setts){
            var opts = setts[cat];
            if (!options[cat])
               options[cat] = {};
            each_in_cat(plug_id, opts, options, cat);
         }
      }
      
      // <conflicts>
      var conflicts = [];
      for (var option_id in options_id)
         if (options_id[option_id] && options_id[option_id].length > 1)
            conflicts.push(vk_lib.format('Option: <b>%1</b>. Found in: %2', option_id, options_id[option_id].join(', ')));
         
      if (conflicts.length)
         new MessageBox({title:'Conflicts',hideButtons:true}).content(conflicts.join('<br>')).show();
      // </conflicts>
      
      return options;
   },
   get_switcher_code:function(option_data){
      // чекбоксы
      //
      var html = '';
      if (!option_data.options){ // checkbox
         html = vk_lib.tpl_process(vkopt.settings.tpls['checkbox'], {
               id: option_data.id,
               caption: IDL(option_data.title || option_data.plug_id+'.'+option_data.id, 2),
               on_class: vkopt.settings.get(option_data.id) ? 'on': ''
            });
         if (option_data.sub){
            var content = '';
            for (var option_id in option_data.sub){
               content += vkopt.settings.get_switcher_code(option_data.sub[option_id]);
            }
            html += vk_lib.tpl_process(vkopt.settings.tpls['sub_block'], {content: content});
         }
      } else { // radio group
         
      }
      return html;
   }
}

vkopt['photoview'] =  {
   onSettings:{
      Media:{
         scroll_to_next:{
            title: 'seScroolPhoto'
         }
      }
   },
   onLibFiles: function(file_name){
      if (file_name == 'photoview.js')
         Inj.Start('photoview.afterShow','vkopt.photoview.scroll_view();');
   },
   scroll_view: function() {
   	 // можно конечно для оптимизации и в onLibFiles перенести проверку активности опции + вызов onLibFiles по событию onOptionChanged('scroll_to_next'), для инъекции на лету при переключении опции
       // но есть ли смысл? падения вызывать не должно, т.к в самое начало функции инъектится
      if (!vkopt.settings.get('scroll_to_next')) return;
      vkopt.photoview.allow_scroll_view = true;
   	var on_scroll = function (is_next) {
   		if (vkopt.photoview.allow_scroll_view && isVisible('pv_nav_right') && isVisible('pv_nav_left')) {
   			if (!cur.pvTagger && !boxQueue.count() && !document.activeElement.focused ) { //&& (!cur.pvComment || !cur.pvComment.focused)
   				if (is_next) {
   					photoview.show(cur.pvListId, cur.pvIndex + 1);
   				} else {
   					photoview.show(cur.pvListId, cur.pvIndex - 1);
   				}
   			}
   			vkopt.photoview.allow_scroll_view = false;
   			setTimeout(function(){ vkopt.photoview.allow_scroll_view = true }, 200);
   		}
   	};
   	var _next = function (e) {
   		on_scroll(1, e)
   	};
   	var _prev = function (e) {
   		on_scroll(0, e)
   	};
   	vkSetMouseScroll(geByClass1("pv_img_area_wrap"), _next, _prev);
   },

}

vkopt['photos'] =  {
   css: '\
      #vk_ph_upd_btn{opacity:0.1}\
      #vk_ph_upd_btn:hover{opacity:1}\
   ',
   onSettings:{
      Extra:{
         photo_replacer:{}
      }
   },   
   onResponseAnswer: function(answer,url,q){
      if (url == '/al_photos.php' && q.act == 'edit_photo' && (vkopt.settings.get('photo_replacer'))){
         answer[1] = vkopt_core.mod_str_as_node(answer[1], vkopt.photos.update_photo_btn, {source:'process_edit_photo_response', url:url, q:q});
      }
   },    
   update_photo: function(photo_id){
      vk_photos.update_photo(photo_id)
      // TODO: move code here from vk_media.js
   },
   update_photo_btn:function(node){
      vk_photos.update_photo_btn(node);
      // TODO: move code here from vk_media.js
   }   
}

vkopt['audio'] =  {
   css: function(){
      var codes = vk_lib.get_block_comments(function(){
      /*dl:
      .audio_row .audio_acts .audio_act.vk_audio_dl_btn{
         display:block;
      }
      .audio_row .audio_acts .audio_act.vk_audio_dl_btn>div {
         background-image: url(/images/blog/about_icons.png);
         width: 12px;
         height: 14px;
         background-position: 0px -309px;
      }
      .audio_row .audio_acts .audio_act.vk_audio_dl_btn.dl_url_loading>div{
         opacity:0.3;
         background: url(/images/upload_inv_mini.gif) no-repeat 0% 50%;
         width: 17px;
         margin-left: -2px;
      }
      
      .audio_row .audio_acts .audio_act.vk_audio_acts{
         display:block;
      }      
      .audio_row .audio_acts .audio_act.vk_audio_acts>div {
         background: url(/images/icons/profile_dots.png) no-repeat 0 5px;
         height: 13px;
         width: 17px;
      }
      
      .audio_row .audio_acts .audio_act.vk_audio_dl_btn.vk_audio_acts>div{
         background: url(/images/icons/profile_dots.png) no-repeat 0 5px;
         height: 13px;
         width: 18px;
         transition: none;
      }     
      .audio_row .audio_acts .audio_act.vk_audio_dl_btn.vk_audio_acts:hover>div{
         background-image: url(/images/blog/about_icons.png);
         width: 12px;
         height: 14px;
         margin-left:3px;
         margin-right:3px;
         background-position: 0px -309px;         
      }
      .audio_row .audio_acts .audio_act.vk_audio_dl_btn.dl_url_loading>div,
      .audio_row .audio_acts .audio_act.vk_audio_dl_btn.dl_url_loading:hover>div{
         opacity:0.3;
         background: url(/images/upload_inv_mini.gif) no-repeat 0% 50%;
         width: 18px;
      }
      
      
      .audio_duration_wrap.vk_with_au_info .audio_duration{
         display: inline;
      }

      .audio_row.vk_info_loaded .vk_audio_size_info_wrap, 
      .vk_size_info_on_ctrl .ctrl_key_pressed .audio_row.vk_info_loaded .vk_audio_size_info_wrap,
      .vk_size_info_on_ctrl .audio_hq_label_show .audio_row.vk_info_loaded .vk_audio_size_info_wrap{
         display: table;
      }
      
      .vk_audio_size_info_wrap,
      .narrow_column .audios_module .vk_audio_size_info_wrap, 
      .vk_size_info_on_ctrl .audio_row .vk_audio_size_info_wrap,
      .audio_row:hover .vk_audio_size_info_wrap,
      .vk_size_info_on_ctrl .audio_hq_label_show .audio_row:hover .vk_audio_size_info_wrap,
      .vk_size_info_on_ctrl .audio_row:hover .vk_audio_size_info_wrap
      {
         display: none;
      }
      .vk_audio_size_info_wrap{
         font-size: 10px;
         line-height: 9px;
         margin-right: 3px;
      }
      
      .vk_compact_audio .vk_audio_size_info_wrap{
         margin-top: 0px;
         height: 18px;
      }      
      .vk_audio_size_info_wrap{
         margin-top: -4px;
         height: 20px;
      }
      
      .vk_audio_size_info{
         display: table-cell;
         vertical-align: middle;
      }
      .vk_audio_hq_label {
         display: inline-block;
         width: 15px;
         height: 11px;
         background-image: url(/images/icons/audio_hq.png);
         opacity: 0.35;
         vertical-align: top;
         margin-top: 3px;
         margin-right: 4px;
      }
      .vk_acts_menu_block a{
         display: block;
         white-space: nowrap;
      }
      */
      });
      return codes.dl;
   },
   tpls: {},
   onSettings:{
      Media:{
         audio_dl: {
            title: 'seLinkAu',
            info: 'infoUseNetTrafic'
         },
         audio_size_info: {
            title: 'seAudioSizeAuto',
            info: 'infoUseNetTrafic',
            sub: {
               size_info_on_ctrl: {
                  title: 'seAudioSizeShowOnCtrl',
                  class_toggler: true
               }
            }
         },
         audio_clean_titles: {
            title: 'seAudioUntrashTitle'
         }
      },
      Extra:{
         audio_more_acts:{
            sub:{
               audio_dl_acts_2_btns:{}
            }
         },
         audio_edit_box_album_selector:{}
      }
   },
   onLibFiles: function(file_name){
      if (file_name == 'audioplayer.js'){
         if (vkopt.settings.get('audio_dl')){
            Inj.Start('AudioPlayer.prototype.toggleAudio','if (vkopt.audio.prevent_play_check()) return true;'); // для предотвращения воспроизведения при нажатии на "скачать"
         }
      }
   },
   onInit: function(){
      vkopt.audio.tpls = vk_lib.get_block_comments(function(){
      /*dl_button:
      <a class="audio_act vk_audio_dl_btn" id="vk_dl_{vals.id}" data-aid="{vals.id}" download="{vals.filename}" href="{vals.url}" onmousedown="vkopt.audio.prevent_play();" onclick="vkopt.audio.prevent_play(); return vkDownloadFile(this);" onmouseover="vkopt.audio.btn_over(this);"><div></div></a>
      */
      /*acts_button:
      <a class="audio_act vk_audio_acts" id="vk_acts_{vals.id}" data-aid="{vals.id}" onmousedown="vkopt.audio.prevent_play();" onmouseover="vkopt.audio.acts.menu(this);" onclick="vkopt.audio.prevent_play();"><div></div></a>
      */      
      /*size_info:
      <small class="fl_l vk_audio_size_info_wrap" id="vk_audio_size_info_{vals.id}">
         <div class="vk_audio_size_info">
            <span class="vk_audio_size">{vals.size}</span>
            <span class="vk_audio_kbps">{vals.kbps}</span>
         </div>
      </small>        
      */
      /*wiki_code:
      <center>
         <input type="text" value="[[audio{vals.full_id}]]" readonly class="text" style="text-align: center;" onClick="this.focus();this.select();" size="30"/>
         <!--
         <br><br>
         <a href="/audio?{vals.oid_type}={vals.oid_abs}&audio_id={vals.aid}">{lng.Link}</a>
         --!>
      </center>      
      */
      /*acts_menu:
      <a href="#" onclick="vkopt.audio.add_to_group({vals.ownerId}, {vals.id}); return false;">{lng.AddToGroup}</a>
      <a href="#" onclick="return vkopt.audio.share('{vals.fullId}');">{lng.Share}</a>
      <a href="#" onclick="vkopt.audio.acts.wiki('{vals.fullId}',{vals.owner_id},{vals.id}); return false">{lng.Wiki}</a>
      
      */
      });
      vkopt.audio.load_sizes_cache();
   },
   onResponseAnswer: function(answer, url, q){
      if (vkopt.settings.get('audio_edit_box_album_selector') && q.act=='edit_audio_box' && answer[2]) answer[2]=answer[2]+'\n vkopt.audio.edit_box_move("'+q.aid+'");';
   },
   album_cache: {},
   edit_box_move: function(full_aid){
      var x=full_aid.split('_');
      var oid=parseInt(x[0]);
      var aid=parseInt(x[1]);
      
      var info = AudioUtils.getAudioFromEl(ge('audio_'+full_aid))
      var def_aid = info[AudioUtils.AUDIO_ITEM_INDEX_ALBUM_ID];
      
      var cur_offset=0;
      var alb_count=100;
      var albums=[];
      var get_albums=function(callback){
         if (vkopt.audio.album_cache[''+oid]) {
            callback(vkopt.audio.album_cache[''+oid]);
            return;
         }
         var params={count:100,offset:cur_offset};
         params[oid<0?'gid':'uid']=Math.abs(oid);
         dApi.call('audio.getAlbums',params,function(r){
            var _albums=r.response;
            alb_count=_albums.shift();
            
            albums=albums.concat(_albums);
            if (_albums.length<100){
               vkopt.audio.album_cache[''+oid]=albums;
               callback(albums);
            } else {
               cur_offset+=100;
               get_albums(callback);
            }   
         });
      };
      var p=ge('audio_extra_link');
      if (!p) return;
      var div=vkCe('div',{id:'vk_audio_mover', 'class':'audio_edit_row clear_fix'},'\
                    <div class="audio_edit_label fl_l ta_r">'+IDL('SelectAlbum',1)+'</div>\
                    <div class="audio_edit_input fl_l"><div id="vk_audio_album_selector"></div><div id="vk_au_alb_ldr">'+vkLdrImg+'</div></div>\
                  ');
      p.parentNode.insertBefore(div,p); 
      
      get_albums(function(list){         
         stManager.add(['ui_controls.js', 'ui_controls.css'],function(){
            var items=[];
            items.push(['0',IDL('NotInAlbums')]);
            for (var i=0; i<list.length;i++){
               items.push([list[i].album_id,list[i].title]);
            }
            
            cur.vk_auMoveToAlbum = new Dropdown(ge('vk_audio_album_selector'), items, {
                 width: 298,
                 selectedItems: [def_aid],
                 autocomplete: (items.length > 7),
                 onChange: function(val) {
                   if (!intval(val)) {
                     cur.vk_auMoveToAlbum.val(0);
                   }
                   var to_album=cur.vk_auMoveToAlbum.val();
                   show('vk_au_alb_ldr');
                   
                   //*
                   var params={aids:aid,album_id:to_album};
                   if (oid<0) params['gid']=Math.abs(oid);
                   dApi.call('audio.moveToAlbum',params,function(r){
                     if(r.response==1){
                        // TODO: допилить. ибо в закэшированных плейлистах не изменяется до перезагрузки страницы
                        var u = {};
                        u[AudioUtils.AUDIO_ITEM_INDEX_ALBUM_ID] = to_album,
                        getAudioPlayer().updateAudio(info, u);
                        
                        hide('vk_au_alb_ldr');
                     } 
                   });
                 }
            });
            hide('vk_au_alb_ldr');
         });         
      });
   },
   remove_trash:function(s){
      s=vkRemoveTrash(s); // удаление символов не являющихся буквами/иероглифами/и т.д
      // Удаление лишних дефисов в названиях и приведение их к одному виду
      s=s.replace(/\[\s*\]|\(\s*\)|\{\s*\}/g,'');
      s=s.replace(/[\u1806\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u2043\u02D7\u2796\-]+/g,'\u2013').replace(/\u2013\s*\u2013/g,'\u2013');
      s=s.replace(/[\u1806\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u2043\u02D7\u2796\-]+$/,'');// ^[\s\u1806\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u2043\u02D7\u2796\-]+
      return s;
   },
   share: function(audio_fullId){
      showBox("like.php", {
            act: "publish_box",
            object: "audio" + audio_fullId,
            //list: "s" + vk.id, ???
            to: "mail"
      }, {
            stat: ["page.js", "page.css", "wide_dd.js", "wide_dd.css", "sharebox.js"],
            onFail: function(t) {
                return showDoneBox(t),
                !0
            }
      })
      return false;
   },
   add_to_group: function(oid, aid, to_gid){
      // TODO: move code from vk_media.js
      vk_audio.add_to_group(oid, aid, to_gid);
   },
   btn_over: function(el){
      vkopt.audio.check_dl_url(el); 
      vkDragOutFile(el); 
      if (!vkopt.settings.get('audio_dl_acts_2_btns') && vkopt.settings.get('audio_more_acts'))
         vkopt.audio.acts.menu(el);
   },
   check_dl_url: function(el){   // если на странице не было ссылок на аудио, то при наведении на кнопку загрузки ждём их появления в кэше.
      if (el.getAttribute('href') == ''){
         addClass(el,'dl_url_loading');
         var id = el.dataset["aid"];
         function wait_and_set_url(){
            var info = vkopt.audio.__full_audio_info_cache[id];
            if (info){
               var name = vkCleanFileName(info.performer + ' - ' + info.title);
               var url = vkopt.audio.make_dl_url(info.url, name);
               el.setAttribute('href', url);
               removeClass(el,'dl_url_loading');
            } else {
               setTimeout(function(){
                  wait_and_set_url();
               },300);
            }           
         }
         wait_and_set_url();
      }
   },
   make_dl_url: function(url, name){
      name = vkCleanFileName(name);
      return url + '#FILENAME/' + vkEncodeFileName(name) + '.mp3';
   },
   processNode: function(node, params){
      if (vkopt.settings.get('audio_clean_titles')){ // clean titles
         var nodes=geByClass('audio_title_wrap',node);
         for (var i=0; i<nodes.length; i++){
            FindAndProcessTextNodes(nodes[i],function(mainNode,childItem){
               var el = mainNode.childNodes[childItem];
               if (el.nodeValue && !/^[\u2013\s]+$/.test(el.nodeValue)){
                  el.nodeValue=vkopt.audio.remove_trash(el.nodeValue);
               }
               return childItem;
            });
         }
      }
      
      
      
      if (!vkopt.settings.get('audio_dl') && !vkopt.settings.get('audio_more_acts')) return;
      if (!vkopt.audio.__full_audio_info_cache)
         vkopt.audio.__full_audio_info_cache = {};
      var cache = vkopt.audio.__full_audio_info_cache;
      
      var audios = geByClass('audio_row',node);
      if (!audios.length && hasClass(node, 'audio_row')) // если вызов из AutoList.prototype._drawRows, то на входе уже элемент audio_row
         audios = [node]
      
      for (var i = 0; i < audios.length; i++){
         var row = audios[i];
         var acts = geByClass1('audio_acts', row);
         var dur = geByClass1('audio_duration', row);
         var info = null;
         try {
            info = JSON.parse(row.dataset["audio"]);
         } catch(e) {
            
         }         
         if (!acts || !info) continue;
         var info_obj = AudioUtils.asObject(info);
         if (info_obj.url==""){                    // собираем очередь из аудио, которым требуется подгрузка инфы
            if (cache[info_obj.fullId])
               info_obj = cache[info_obj.fullId];
            else
               if (vkopt.audio.__load_queue.indexOf(info_obj.fullId) == -1 && vkopt.audio.__loading_queue.indexOf(info_obj.fullId) == -1)
                  vkopt.audio.__load_queue.push(info_obj.fullId);
         }
         var name = vkCleanFileName(info[3]+' - '+info[4]);
         var btn = se(
            vk_lib.tpl_process(vkopt.audio.tpls['dl_button'], {
               id: info_obj.fullId,
               filename: name+'.mp3',
               url: info_obj.url ? vkopt.audio.make_dl_url(info_obj.url, name) : ''
            })
         );
         
         if (!vkopt.settings.get('audio_dl_acts_2_btns') && vkopt.settings.get('audio_more_acts')){
            addClass(btn,'vk_audio_acts');
         }
         
         var acts_btn = se(
            vk_lib.tpl_process(vkopt.audio.tpls['acts_button'], {
               id: info_obj.fullId
            })
         ); 
         
         var size = vkopt.audio._sizes_cache[info_obj.id];
         var sz_labels = size ? vkopt.audio.size_to_bitrare(size, info_obj.duration) : {};
         if (size){
            row.dataset['kbps'] = sz_labels.kbps_raw; 
            row.dataset['filesize'] = size;
            addClass(row, 'vk_info_loaded');
         }
         
         var sz_info = se(vk_lib.tpl_process(vkopt.audio.tpls['size_info'], {
               id: info_obj.fullId,
               url: info_obj.url || '',
               size: sz_labels.size || '? Mb',
               kbps: sz_labels.kbps || '? Kbps'
            }));
         
         // Инфа о размере/битрейте
         if (vkopt.settings.get('audio_size_info')){
            if (info_obj.url)
               setTimeout(
                  (function(id, url){
                     return function(){
                        vkopt.audio.load_size_info(id, url);
                     }
                  })(info_obj.fullId, info_obj.url),
                  200
               );
            
            if (dur && !hasClass('vk_with_au_info',dur.parentNode)){
               dur.parentNode.insertBefore(sz_info, dur);
               addClass(dur.parentNode, 'vk_with_au_info');
            }
         }
         // Кнопка скачивания
         if (vkopt.settings.get('audio_dl') && !geByClass1('vk_audio_dl_btn',acts))
            (acts.firstChild && !vkopt.settings.get('audio_dl_acts_2_btns')) ? acts.insertBefore(btn, acts.firstChild) : acts.appendChild(btn);

         // Менюшка
          if ((!vkopt.settings.get('audio_dl') || vkopt.settings.get('audio_dl_acts_2_btns')) && vkopt.settings.get('audio_more_acts'))
             acts.firstChild ? acts.insertBefore(acts_btn, acts.firstChild) : acts.appendChild(acts_btn);
      }
      
      if (vkopt.settings.get('audio_size_info') || vkopt.settings.get('audio_dl')) // URL'ы нужны только для этих опций
         vkopt.audio.load_audio_urls(); // запускаем процесс загрузки инфы об аудио из очереди
   },
   _sizes_cache: {}, // надо бы его загонять в локальное хранилище, но например кэш размеров со списка в ~500 аудио занимает около 10кб. т.е его нужно будет как-то по умному чистить.
   info_thread_count: 0,  
   save_sizes_cache:function(){
      clearTimeout(vkopt.audio._save_size_cache);
      vkopt.audio._save_size_cache = setTimeout(function(){
         var cache = vkopt.audio._sizes_cache;
         var len = 0;
         var max_items = vkopt_defaults.config.MAX_CACHE_AUDIO_SIZE_ITEMS;
         for (var key in cache) len++;
         if (len > max_items){
            var new_cache = {};
            var i = 0;
            for (var key in cache){
               i++;
               if (i > len - max_items)
                  new_cache[key] = cache[key];
            }
            cache = new_cache;
         }
         localStorage['vkopt_audio_sizes_cache'] = JSON.stringify(cache);
      },1500);
   },
   load_sizes_cache:function(){
      var sz_cache = {};
      try{
         sz_cache = JSON.parse(localStorage['vkopt_audio_sizes_cache'] || '{}');
      } catch(e){}
      vkopt.audio._sizes_cache = sz_cache;
   },   
   size_to_bitrare: function(size, duration){
      var kbit = size / 128;
      var kbps = Math.ceil(Math.round(kbit/duration)/16)*16;
      return {
         size: vkFileSize(size, 1).replace(/([\d\.]+)/,'<b>$1</b>'),
         kbps: (kbps > 0 ? '<b>' + kbps + '</b> Kbps' : ''),
         kbps_raw: kbps
      }      
   },
   load_size_info: function(id, url){
      if (vkopt.audio.info_thread_count >= vkopt_defaults.config.AUDIO_INFO_LOAD_THREADS_COUNT){
         var t = setInterval(function(){
            if (vkopt.audio.info_thread_count < vkopt_defaults.config.AUDIO_INFO_LOAD_THREADS_COUNT){
               clearInterval(t);
               vkopt.audio.load_size_info(id, url);
            }
         },50);
         return;
      }
      if (!vkopt.settings.get('audio_size_info')) return;      
      
      var aid = id.split('_')[1];
      var size = vkopt.audio._sizes_cache[aid];
      var rb = true;
      var WAIT_TIME = 4000;
      var els = geByClass('_audio_row_' + id);
      var set_size_info = function(size){
         for (var i = 0; i < els.length; i++){
            var el = els[i];
            var info = AudioUtils.asObject(AudioUtils.getAudioFromEl(el));
            var size_el = geByClass1('vk_audio_size', el);
            var kbps_el = geByClass1('vk_audio_kbps', el);
            
            var sz_info = vkopt.audio.size_to_bitrare(size, info.duration);
            val(size_el, sz_info.size);
            val(kbps_el, sz_info.kbps);
            
            el.dataset['kbps'] = sz_info.kbps_raw; 
            el.dataset['filesize'] = size;
            addClass(el, 'vk_info_loaded');
            if (sz_info.kbps_raw > 0 && !vkopt.audio._sizes_cache[aid]){
               vkopt.audio._sizes_cache[aid] = size;
               vkopt.audio.save_sizes_cache();
            }
         }
      };
      if (size){
         set_size_info(size);
      } else 
      if (els.length){
         var reset=setTimeout(function(){
            vkopt.audio.info_thread_count--;
            rb = false;
         }, WAIT_TIME);
         vkopt.audio.info_thread_count++;
         XFR.post(url, {}, function(h, size){
            clearTimeout(reset);
            if (rb){
               vkopt.audio.info_thread_count--;
            }
            if (size > 0){
               set_size_info(size);
            } else {
               // TODO: видать ссылка протухла. нужно подгрузить актуальный URL и снова запросить размер
            }            
         }, true);	
      }     
   },   
   __load_queue:[],
   __loading_queue:[],
   __load_req_num: 1,
   load_audio_urls: function(){
      if (vkopt.audio.__load_queue.length == 0 || vkopt.audio.__loading_queue.length > 0) // если нет списка на подгрузку, или что-то уже грузится - игнорим вызов
         return;
      
      vkopt.audio.__loading_queue = vkopt.audio.__load_queue.splice(0,Math.min(vkopt.audio.__load_queue.length, vkRandomRange(5,10))); // больше 10 аудио не принимает.
      var load_info = function(){
         //TODO: удаление из __load_queue отсутствущих на странице аудио
         
         ajax.post("al_audio.php", {
            act : "reload_audio",
            ids :  vkopt.audio.__loading_queue.join(",")
         }, {
            onDone : function (data) {
               if (!data){ // вероятно косяк с детектом множества однотипных действий
                  console.log('Load audio info failed:', vkopt.audio.__load_req_num, vkopt.audio.__loading_queue.join(","));
                  setTimeout(function(){
                     console.log('try load again');
                     load_info();
                  }, 10000);
               } else {
                  //console.log('on done:', vkopt.audio.__load_req_num, data);
                  vkopt.audio.__loading_queue = [];
                  each(data, function (i, info) {
                     info = AudioUtils.asObject(info);
                     vkopt.audio.__full_audio_info_cache[info.fullId] = info;
                     if (info.url)
                        vkopt.audio.load_size_info(info.fullId, info.url);
                  });
                  if (vkopt.audio.__load_queue.length > 0) // если в очереди есть аудио - продолжаем грузить
                     vkopt.audio.load_audio_urls();
               }
            }
         })
         vkopt.audio.__load_req_num++;
      };
      
      clearTimeout(vkopt.audio.__load_delay); // за короткий промежуток времени аудио могло появиться в разных местах. чуть ждём пока устаканится список.
      vkopt.audio.__load_delay = setTimeout(
         function(){
            load_info();
         }, 
         vkopt.audio.__load_req_num %20 == 0 ? 3500 : 350 // попытка избежать тетекта однотипных действий
      );
   },
   load_all: function(callback){ // пока не используется. добавлено чтоб не забыть о таком способе получения ссылок (в новом вк нет упоминаний об этом методе).
      var query = {
         act : 'load_audios_silent',
         id : (cur.allAudiosIndex == 'all' ? cur.id : cur.audioFriend),
         gid : cur.gid,
         claim : nav.objLoc.claim,  // Для silent-подгрузки похоже не работает ни на старой, ни на новой версии вк. 
                                    // На старой версии по URL https://vk.com/audio?claim=1 показываются только те заблоченные, что попадают в видимый без подгрузки список.
         please_dont_ddos : 2
      };
      if (cur.club) 
         query.club = cur.club;
      
      ajax.post('/al_audio.php', query, {
         onDone : (function (data, opts) {
            callback(data)
         })
      });
   },
   prevent_play_check: function(){
      if (vkopt.audio.__play_blocked){
         vkopt.audio.__play_blocked = false;
         return true;
      }
      return false;
   },
   prevent_play: function(){
      vkopt.audio.__play_blocked = true; 
   },
   acts: {
      menu : function (btn) {
         var audioRow = gpeByClass('_audio_row', btn);
         var info = AudioUtils.getAudioFromEl(audioRow);
         var info_obj = AudioUtils.asObject(info);
         var menu_code = vk_lib.tpl_process(vkopt.audio.tpls['acts_menu'], info_obj) 
         
         var raw_list = vkopt_core.plugins.call_modules('onAudioRowMenuItems',info_obj); // собираем доп. пункты со всех плагинов в один список
         var additional_items = [];
         for (var plug_id in raw_list) 
            additional_items = additional_items.concat(raw_list[plug_id]);
     
         menu_code += additional_items.join('\n');

         var options = {
            text : function () {
               return menu_code;
            },
            dir: "down",
            shift : [14, 5, 0],
            hasover: true,
            onCreate: function(){
               addClass(btn.tt.container, 'vk_acts_menu_block');
               addEvent(btn.tt.container, 'click', vkopt.audio.prevent_play);
               addEvent(btn.tt.container, 'mousedown', vkopt.audio.prevent_play);
               addEvent(btn.tt.container, 'mousedown', cancelEvent); // блочим перетаскивание за меню
            }
         };
         showTooltip(btn, options);
      },
      wiki: function(full_id,oid,id){
         var code = vk_lib.tpl_process(vkopt.audio.tpls['wiki_code'], {
               full_id: full_id,
               aid: id,
               oid: oid,
               oid_abs: Math.abs(oid),
               oid_type: (parseInt(oid)>0?'id':'gid')
         });
         vkAlertBox('Wiki-code:',code);
      }
   }
   
}

vkopt['scrobbler'] = {
   css: function(){
      return '\
      .lastfm_audio_page{position: absolute;margin-top: -20px;margin-left: 5px;} \
      .top_audio_player_title_wrap .lastfm_status{position:fixed; z-index: 121; margin-left: 10px;}\
      .lastfm_white .vk_lastfm_icon{background-image:url("'+vkLastFM.res.white.last_fm+'");}\
      .lastfm_white .vk_lastfm_playing_icon{background-image:url("'+vkLastFM.res.white.playing_icon+'");}\
      .lastfm_white .vk_lastfm_paused_icon{background-image:url("'+vkLastFM.res.white.paused_icon+'");}\
      .lastfm_white .vk_lastfm_ok_icon{background-image:url("'+vkLastFM.res.white.scrobble_ok+'");}\
      .lastfm_white .vk_lastfm_fail_icon{background-image:url("'+vkLastFM.res.white.scrobble_fail+'");}\
      .lastfm_white .lastfm_fav_icon{background-position: 0 -10px;}\
      ' + vkopt_plugins['vklastfm'].css;
   },
   onSettings:{
      Media:{
         scrobbler: {
            title: 'seScrobbler',
            need_reload: true
         }
      }
   },
   onLocation: function(){
      if (!vkopt.settings.get('scrobbler')) return;
      vkLastFM.on_location();
   },
   onInit: function(){
      vkLastFM.audio_info = vkopt.scrobbler.audio_info;
      vkLastFM.ui = vkopt.scrobbler.ui;
      vkLastFM.tip = vkopt.scrobbler.tip;
      vkLastFM.set_love_icon = vkopt.scrobbler.set_love_icon;
      vkLastFM.init();
   },
   onLibFiles: function(file_name){
      if (!vkopt.settings.get('scrobbler')) return;
      if (file_name=='audioplayer.js')
         /*  можно конечно по адекватному через метод AudioPlayer.prototype.on добавлять обработчики событий плеера в массив subscribers, но как оно себя поведёт  - надо проверять.
         var pl = getAudioPlayer(), 
             pl.on(this, AudioPlayer.EVENT_UPDATE, function(){console.log('update ', arguments)}),
             pl.on(this, AudioPlayer.EVENT_PLAY, function(){console.log('play ', arguments)}),
             pl.on(this, AudioPlayer.EVENT_PAUSE, function(){console.log('pause ', arguments)});
         */
         Inj.End('AudioPlayer.prototype.notify','vkopt.scrobbler.onPlayerNotify(#ARG0#, #ARG1#, #ARG2#)');
         //Inj.End('audioPlayer.setGraphics','vkLastFM.onPlayerState(act);');
   },
   onPlayerNotify: function(event_name, data, var1){
      /*
      if (['buffered','progress'].indexOf(event_name) == -1)
         console.log(event_name, data, var1);
      */
      var act = '';
      switch(event_name){
         case 'start':
            data && vkLastFM.onPlayerState('load');
            vkLastFM.onPlayerState('play');
            break;
         case 'pause':
            vkLastFM.onPlayerState('pause');
            break;
         case 'stop': // происходит только при разлогивании
            vkLastFM.onPlayerState('stop');
            break;   
      }
   },
   audio_info:function(){
      var fm=vkLastFM;
      if (!(window.AudioUtils)) return {};
      var cur_audio = AudioUtils.asObject(getAudioPlayer().getCurrentAudio());
      var a = cur_audio || {};
      return {
         title    :fm.clean(a.title),
         artist   :fm.clean(a.performer),
         duration :a.duration,
         url      :a.url,
         oid      :a.owner_id,
         aid      :a.id
      };
   },
   tip:function(el,text, opts){ 
         var dx, dy1, dy2;
         opts = opts || {};
         dx=7;
         dy1=-13;
         dy2=-12;
         if (el.tt && el.tt.container) {
            val(geByClass1('tt_text', el.tt.container), text);
         }
         showTooltip(el, {
            content: '<div class="tt_text">' + text + '</div>',
            //className: 'slider_hint',
            black: 1,
            shift: [4 + intval(dx), 13 + intval(dy1), 16 + intval(dy2)],
            showdt:300,
            onHide:opts.onHide,
            onShowStart:opts.onShowStart
         });     
   },
   set_love_icon:function(is_loved){
      var els=geByClass('lastfm_fav_icon');
      for (var i=0; i<els.length;i++){ 
         var el=els[i];
         (is_loved?removeClass:addClass)(el,'loved');
         
         if (el.tt) el.tt.hide();
         el.onmouseover=function(e){
            var el=e.target;
            var text=IDL(!hasClass(el,'loved')?'LastFMAddToLoved':'LastFMRemoveFromLoved');
            
            if (el.tt && el.tt.container) {
               val(geByClass1('tt_text', el.tt.container), text);
            }
            showTooltip(el, {
               content: '<div class="tt_text">' + text + '</div>',
               showdt: 0, black: 1, shift: [15, 4, 0]});
         }
      }   
   },   
   ui:function(){
     var fm=vkLastFM;
     var controls=
         '<div class="lastfm_status">\
            <div class="fl_l lastfm_status_icon"></div>\
            <div class="fl_r vk_lastfm_icon'+(fm.enable_scrobbling?'':' disabled')+'" onclick="vkLastFM.toggle(); cancelEvent(event); return false;"  onmousedown="cancelEvent(event)"></div>\
            <div class="fl_r lastfm_fav_icon" onclick="vkLastFM.on_love_btn(this); cancelEvent(event); return false;"></div>\
         </div>';

     var wraps = geByClass('audio_page_player_volume_wrap');
     for (var i = 0; i < wraps.length; i++){
        var ap = wraps[i].firstChild;
        if (ap && !geByClass('lastfm_status',ap.parentNode)[0]){
            ap.parentNode.insertBefore(vkCe('div',{'class':'fl_r lastfm_audio_page'},controls),ap);
        }
     }
     
     var wraps = geByClass('top_audio_player_title_wrap');
     for (var i = 0; i < wraps.length; i++){
        var ap = wraps[i].firstChild;
        if (ap && !geByClass('lastfm_status',ap.parentNode)[0]){
            ap.parentNode.insertBefore(vkCe('div',{'class':'fl_r lastfm_white'},controls),ap);
        }
     }     
  
     var els=geByClass('vk_lastfm_icon');
     for (var i=0; i<els.length;i++){
         els[i].onmouseover=
         (function(z){
            return function(){
               var text=IDL(fm.enable_scrobbling?'ScrobblingOn':'ScrobblingOff').replace(/<username>/g,fm.username);
               text+=' <a href="#" onclick="vkLastFM.logout();">'+IDL('Logout')+'</a>';
               if (!fm.username) text=IDL('AuthNeeded');
               fm.tip(els[z],text);  
            }
         })(i);
         
     }
   } 
}

vkopt['audioplayer'] = {
   onSettings:{
      Extra:{
         add_to_next_fix: {}
      }
   },   
   audioObjToArr: function(obj){
      if (isObject(obj)){
         var arr = ["", "", "", "", "", 0, 0, 0, "", 0, 0, "", "[]"];
         arr[AudioUtils.AUDIO_ITEM_INDEX_ID] = obj.id;
         arr[AudioUtils.AUDIO_ITEM_INDEX_OWNER_ID] = obj.ownerId;
         arr[AudioUtils.AUDIO_ITEM_INDEX_TITLE] = obj.title;
         arr[AudioUtils.AUDIO_ITEM_INDEX_PERFORMER] = obj.performer;
         arr[AudioUtils.AUDIO_ITEM_INDEX_DURATION] = obj.duration;
         arr[AudioUtils.AUDIO_ITEM_INDEX_URL] = obj.url;
         arr[AudioUtils.AUDIO_ITEM_INDEX_FLAGS] = obj.flags;
         arr[AudioUtils.AUDIO_ITEM_INDEX_CONTEXT] = obj.context;
         arr[AudioUtils.AUDIO_ITEM_INDEX_EXTRA] = obj.extra;
         return arr;
      } else {
         return obj;
      }
   },
   onLibFiles: function(file_name){
      if (!vkopt.settings.get('add_to_next_fix')) return;
      if (file_name=='audioplayer.js')
         // багфикс: при добавлении инфы об аудио в виде объекта в плейлист, оно не добавляется. впихиваем костыль для конверта объекта в массив. 
         Inj.Replace('AudioPlaylist.prototype.addAudio',/(([a-z_0-9]+)\.length)(\s*&&\s*([a-z_0-9]+)\(\2\))/,'($1$3) || ($2.fullId && $4(vkopt.audioplayer.audioObjToArr($2)))') 
      
   }
}

vkopt['messages'] = {
   css: function(){
      return vk_lib.get_block_comments(function(){
         /*css:
         .vk_im_dialogs_right .im-page-wrapper .im-page .im-page--dialogs{
            float: right;
         }
         .vk_im_dialogs_right .im-page-wrapper .im-page .im-page--history {
            margin-left: 0px;
            margin-right: 317px;
         }
         .vk_im_dialogs_right .im-page-wrapper .im-page .im-create{
            left: auto;
            right: 0px;
         }
         
         .vk_im_hide_dialogs .im-page-wrapper .im-page .im-page--dialogs{
            display: none;
            position: absolute;
         }
         .vk_im_hide_dialogs.vk_im_dialogs_right .im-page-wrapper .im-page .im-page--dialogs {
            right: 0px;
         }
         
         .vk_im_hide_dialogs.vk_im_dialogs_right .im-page-wrapper .im-page .im-page--history,
         .vk_im_hide_dialogs .im-page-wrapper .im-page .im-page--history
         {
            margin: 0px;
         }
         .vk_im_hide_dialogs .im-page-wrapper .im-page .im-chat-input .im-chat-input--textarea {
            width: 720px;
         }
         .vk_im_hide_dialogs .im-mess-stack .im-mess-stack--content .im-mess-stack--lnk{
            max-width: auto;
         }
         */
      }).css
   },
   onSettings:{
      Messages: {
         im_dialogs_right:{
            title: 'seDialogsListToRight',
            class_toggler: true
         }
      },
      Extra: {
         im_hide_dialogs:{
            class_toggler: true
         }
      }
   },

   onOptionChanged: function(option_id, val, option_data){
      if (option_id == 'im_hide_dialogs'){
         if (!val)
            show(geByClass1('im-page--dialogs'));
         else
            vkopt.messages.dialogs_hide_init();
         
      }
   },
   onLocation: function(nav_obj, cur_module_name){
      if (!vkopt.settings.get('im_hide_dialogs')) 
         return;
      vkopt.messages.dialogs_hide_init();
   },
   dialogs_hide_init: function(){
      if (nav.objLoc[0] != 'im') 
         return;
      var dialogs  = geByClass1('im-page--dialogs');
      
      if (geByClass1('im-page--history_empty')) 
         show(dialogs);

      !hasClass('im--page','vk_hide_dialogs_toggler') && addEvent('im--page','click',function(e){
         if (!vkopt.settings.get('im_hide_dialogs'))
            return;
         addClass('im--page','vk_hide_dialogs_toggler');
         if (domClosest('im-page--chat-body',e.target) || domClosest('im-page--chat-input',e.target))
            hide(dialogs)
         if (domClosest('im-page--header-chat',e.target))
            toggle(dialogs)
      });      
   }
}

vkopt['face'] =  {
   onSettings:{
      Media:{
         compact_audio: {
            title: 'seCompactAudio',
            class_toggler: true
         }
      },

      vkInterface:{
         ad_block:{
            title: 'seADRem',
            class_toggler: true
            
         },
         disable_border_radius:{
            title: 'seDisableBorderRadius',
            class_toggler: true
         },         
      }
   },
   css: function(){
      var codes = vk_lib.get_block_comments(function(){
         /*main:
         .vk_ad_block div#ads_left{
            position: absolute !important;
            left: -9500px !important;
         }
         .vk_disable_border_radius body *{
            border-radius: 0px !important;
         }
         .vk_compact_audio .audio_row{
            padding: 1px;
         }
         .vk_compact_audio .audio_row .audio_play {
            width: 18px;
            height: 18px;
            margin-top: 0px;
            background-position: 5px 4px;
         }
         .vk_compact_audio .audio_row .audio_play.playing, .vk_compact_audio .audio_row.audio_row_playing .audio_play {
            background-position: 5px -19px;
         }
         .vk_compact_audio .audio_row .audio_acts .audio_act{
            padding: 0px 6px;
         }
         .vk_compact_audio .audio_row .audio_acts {
            margin-top: 3px;
         }
         .vk_compact_audio .audio_row .audio_duration_wrap{
            line-height: 18px;
         }
         .vk_compact_audio .audio_row .audio_info{
            line-height: 17px;
            padding-top: 0px;
         }
         .vk_compact_audio .choose_audio_rows .choose_link {
            margin: 0px;
         }
         
         .vk_more_acts_icon{
            background: url(/images/icons/profile_dots.png) no-repeat 0 4px;
            height: 13px;
            width: 17px;
         }

         */
      });
      return codes.main;
   }
}


vkopt['test_module'] =  {
   /*   
   onAudioRowMenuItems: function(info){
      return [
         '<div>---</div>',
         '<div>'+info.fullId+'</div>',
         '<div>^^^</div>',
      ];
   },
   onLibFiles:       function(file_name){
      console.log('test onLibFiles:',file_name)
   },
   onLocation:       function(nav_obj,cur_module_name){
      console.log('test onLocation:',nav_obj,cur_module_name)
   },
   onResponseAnswer: function(answer,url,params){
      console.log('test onResponseAnswer:',url,params,answer[1], answer)
   },
   onStorage :       function(command_id,command_obj){
      console.log('test onStorage:', command_id, command_obj)
   },
   processNode:      function(node, params){
      //console.log('test processNode:',node, params)
   },
   processLinks:     function(link_el, params){
      //console.log('test processLinks:',link_el, params)
   },
   //*/
}


vkopt_core.init();