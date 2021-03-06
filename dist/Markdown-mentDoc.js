/*! mentDoc.js v0.7.0 07-06-2013 
The MIT License (MIT)

Copyright (c) 2013 rodyhaddad

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is furnished
to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

/*!
file: Markdown.Converter.js
A javascript port of Markdown, as used on Stack Overflow
and the rest of Stack Exchange network.

Largely based on showdown.js by John Fraser (Attacklab).

Original Markdown Copyright (c) 2004-2005 John Gruber
  <http://daringfireball.net/projects/markdown/>


Original Showdown code copyright (c) 2007 John Fraser

Modifications and bugfixes (c) 2009 Dana Robinson
Modifications and bugfixes (c) 2009-2013 Stack Exchange Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

//https://code.google.com/p/pagedown/
var Markdown;

if (typeof exports === "object" && typeof require === "function") // we're in a CommonJS (e.g. Node.js) module
    Markdown = exports;
else
    Markdown = {};
    
// The following text is included for historical reasons, but should
// be taken with a pinch of salt; it's not all true anymore.

//
// Wherever possible, Showdown is a straight, line-by-line port
// of the Perl version of Markdown.
//
// This is not a normal parser design; it's basically just a
// series of string substitutions.  It's hard to read and
// maintain this way,  but keeping Showdown close to the original
// design makes it easier to port new features.
//
// More importantly, Showdown behaves like markdown.pl in most
// edge cases.  So web applications can do client-side preview
// in Javascript, and then build identical HTML on the server.
//
// This port needs the new RegExp functionality of ECMA 262,
// 3rd Edition (i.e. Javascript 1.5).  Most modern web browsers
// should do fine.  Even with the new regular expression features,
// We do a lot of work to emulate Perl's regex functionality.
// The tricky changes in this file mostly have the "attacklab:"
// label.  Major or self-explanatory changes don't.
//
// Smart diff tools like Araxis Merge will be able to match up
// this file with markdown.pl in a useful way.  A little tweaking
// helps: in a copy of markdown.pl, replace "#" with "//" and
// replace "$text" with "text".  Be sure to ignore whitespace
// and line endings.
//


//
// Usage:
//
//   var text = "Markdown *rocks*.";
//
//   var converter = new Markdown.Converter();
//   var html = converter.makeHtml(text);
//
//   alert(html);
//
// Note: move the sample code to the bottom of this
// file before uncommenting it.
//

(function () {

    function identity(x) { return x; }
    function returnFalse(x) { return false; }

    function HookCollection() { }

    HookCollection.prototype = {

        chain: function (hookname, func) {
            var original = this[hookname];
            if (!original)
                throw new Error("unknown hook " + hookname);

            if (original === identity)
                this[hookname] = func;
            else
                this[hookname] = function (text) {
                    var args = Array.prototype.slice.call(arguments, 0);
                    args[0] = original.apply(null, args);
                    return func.apply(null, args);
                };
        },
        set: function (hookname, func) {
            if (!this[hookname])
                throw new Error("unknown hook " + hookname);
            this[hookname] = func;
        },
        addNoop: function (hookname) {
            this[hookname] = identity;
        },
        addFalse: function (hookname) {
            this[hookname] = returnFalse;
        }
    };

    Markdown.HookCollection = HookCollection;

    // g_urls and g_titles allow arbitrary user-entered strings as keys. This
    // caused an exception (and hence stopped the rendering) when the user entered
    // e.g. [push] or [__proto__]. Adding a prefix to the actual key prevents this
    // (since no builtin property starts with "s_"). See
    // http://meta.stackoverflow.com/questions/64655/strange-wmd-bug
    // (granted, switching from Array() to Object() alone would have left only __proto__
    // to be a problem)
    function SaveHash() { }
    SaveHash.prototype = {
        set: function (key, value) {
            this["s_" + key] = value;
        },
        get: function (key) {
            return this["s_" + key];
        }
    };

    Markdown.Converter = function () {
        var pluginHooks = this.hooks = new HookCollection();
        
        // given a URL that was encountered by itself (without markup), should return the link text that's to be given to this link
        pluginHooks.addNoop("plainLinkText");
        
        // called with the orignal text as given to makeHtml. The result of this plugin hook is the actual markdown source that will be cooked
        pluginHooks.addNoop("preConversion");
        
        // called with the text once all normalizations have been completed (tabs to spaces, line endings, etc.), but before any conversions have
        pluginHooks.addNoop("postNormalization");
        
        // Called with the text before / after creating block elements like code blocks and lists. Note that this is called recursively
        // with inner content, e.g. it's called with the full text, and then only with the content of a blockquote. The inner
        // call will receive outdented text.
        pluginHooks.addNoop("preBlockGamut");
        pluginHooks.addNoop("postBlockGamut");
        
        // called with the text of a single block element before / after the span-level conversions (bold, code spans, etc.) have been made
        pluginHooks.addNoop("preSpanGamut");
        pluginHooks.addNoop("postSpanGamut");
        
        // called with the final cooked HTML code. The result of this plugin hook is the actual output of makeHtml
        pluginHooks.addNoop("postConversion");

        //
        // Private state of the converter instance:
        //

        // Global hashes, used by various utility routines
        var g_urls;
        var g_titles;
        var g_html_blocks;

        // Used to track when we're inside an ordered or unordered list
        // (see _ProcessListItems() for details):
        var g_list_level;

        this.makeHtml = function (text) {

            //
            // Main function. The order in which other subs are called here is
            // essential. Link and image substitutions need to happen before
            // _EscapeSpecialCharsWithinTagAttributes(), so that any *'s or _'s in the <a>
            // and <img> tags get encoded.
            //

            // This will only happen if makeHtml on the same converter instance is called from a plugin hook.
            // Don't do that.
            if (g_urls)
                throw new Error("Recursive call to converter.makeHtml");
        
            // Create the private state objects.
            g_urls = new SaveHash();
            g_titles = new SaveHash();
            g_html_blocks = [];
            g_list_level = 0;

            text = pluginHooks.preConversion(text);

            // attacklab: Replace ~ with ~T
            // This lets us use tilde as an escape char to avoid md5 hashes
            // The choice of character is arbitray; anything that isn't
            // magic in Markdown will work.
            text = text.replace(/~/g, "~T");

            // attacklab: Replace $ with ~D
            // RegExp interprets $ as a special character
            // when it's in a replacement string
            text = text.replace(/\$/g, "~D");

            // Standardize line endings
            text = text.replace(/\r\n/g, "\n"); // DOS to Unix
            text = text.replace(/\r/g, "\n"); // Mac to Unix

            // Make sure text begins and ends with a couple of newlines:
            text = "\n\n" + text + "\n\n";

            // Convert all tabs to spaces.
            text = _Detab(text);

            // Strip any lines consisting only of spaces and tabs.
            // This makes subsequent regexen easier to write, because we can
            // match consecutive blank lines with /\n+/ instead of something
            // contorted like /[ \t]*\n+/ .
            text = text.replace(/^[ \t]+$/mg, "");
            
            text = pluginHooks.postNormalization(text);

            // Turn block-level HTML blocks into hash entries
            text = _HashHTMLBlocks(text);

            // Strip link definitions, store in hashes.
            text = _StripLinkDefinitions(text);

            text = _RunBlockGamut(text);

            text = _UnescapeSpecialChars(text);

            // attacklab: Restore dollar signs
            text = text.replace(/~D/g, "$$");

            // attacklab: Restore tildes
            text = text.replace(/~T/g, "~");

            text = pluginHooks.postConversion(text);

            g_html_blocks = g_titles = g_urls = null;

            return text;
        };

        function _StripLinkDefinitions(text) {
            //
            // Strips link definitions from text, stores the URLs and titles in
            // hash references.
            //

            // Link defs are in the form: ^[id]: url "optional title"

            /*
            text = text.replace(/
                ^[ ]{0,3}\[(.+)\]:  // id = $1  attacklab: g_tab_width - 1
                [ \t]*
                \n?                 // maybe *one* newline
                [ \t]*
                <?(\S+?)>?          // url = $2
                (?=\s|$)            // lookahead for whitespace instead of the lookbehind removed below
                [ \t]*
                \n?                 // maybe one newline
                [ \t]*
                (                   // (potential) title = $3
                    (\n*)           // any lines skipped = $4 attacklab: lookbehind removed
                    [ \t]+
                    ["(]
                    (.+?)           // title = $5
                    [")]
                    [ \t]*
                )?                  // title is optional
                (?:\n+|$)
            /gm, function(){...});
            */

            text = text.replace(/^[ ]{0,3}\[(.+)\]:[ \t]*\n?[ \t]*<?(\S+?)>?(?=\s|$)[ \t]*\n?[ \t]*((\n*)["(](.+?)[")][ \t]*)?(?:\n+)/gm,
                function (wholeMatch, m1, m2, m3, m4, m5) {
                    m1 = m1.toLowerCase();
                    g_urls.set(m1, _EncodeAmpsAndAngles(m2));  // Link IDs are case-insensitive
                    if (m4) {
                        // Oops, found blank lines, so it's not a title.
                        // Put back the parenthetical statement we stole.
                        return m3;
                    } else if (m5) {
                        g_titles.set(m1, m5.replace(/"/g, "&quot;"));
                    }

                    // Completely remove the definition from the text
                    return "";
                }
            );

            return text;
        }

        function _HashHTMLBlocks(text) {

            // Hashify HTML blocks:
            // We only want to do this for block-level HTML tags, such as headers,
            // lists, and tables. That's because we still want to wrap <p>s around
            // "paragraphs" that are wrapped in non-block-level tags, such as anchors,
            // phrase emphasis, and spans. The list of tags we're looking for is
            // hard-coded:
            var block_tags_a = "p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math|ins|del"
            var block_tags_b = "p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math"

            // First, look for nested blocks, e.g.:
            //   <div>
            //     <div>
            //     tags for inner block must be indented.
            //     </div>
            //   </div>
            //
            // The outermost tags must start at the left margin for this to match, and
            // the inner nested divs must be indented.
            // We need to do this before the next, more liberal match, because the next
            // match will start at the first `<div>` and stop at the first `</div>`.

            // attacklab: This regex can be expensive when it fails.

            /*
            text = text.replace(/
                (                       // save in $1
                    ^                   // start of line  (with /m)
                    <($block_tags_a)    // start tag = $2
                    \b                  // word break
                                        // attacklab: hack around khtml/pcre bug...
                    [^\r]*?\n           // any number of lines, minimally matching
                    </\2>               // the matching end tag
                    [ \t]*              // trailing spaces/tabs
                    (?=\n+)             // followed by a newline
                )                       // attacklab: there are sentinel newlines at end of document
            /gm,function(){...}};
            */
            text = text.replace(/^(<(p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math|ins|del)\b[^\r]*?\n<\/\2>[ \t]*(?=\n+))/gm, hashElement);

            //
            // Now match more liberally, simply from `\n<tag>` to `</tag>\n`
            //

            /*
            text = text.replace(/
                (                       // save in $1
                    ^                   // start of line  (with /m)
                    <($block_tags_b)    // start tag = $2
                    \b                  // word break
                                        // attacklab: hack around khtml/pcre bug...
                    [^\r]*?             // any number of lines, minimally matching
                    .*</\2>             // the matching end tag
                    [ \t]*              // trailing spaces/tabs
                    (?=\n+)             // followed by a newline
                )                       // attacklab: there are sentinel newlines at end of document
            /gm,function(){...}};
            */
            text = text.replace(/^(<(p|div|h[1-6]|blockquote|pre|table|dl|ol|ul|script|noscript|form|fieldset|iframe|math)\b[^\r]*?.*<\/\2>[ \t]*(?=\n+)\n)/gm, hashElement);

            // Special case just for <hr />. It was easier to make a special case than
            // to make the other regex more complicated.  

            /*
            text = text.replace(/
                \n                  // Starting after a blank line
                [ ]{0,3}
                (                   // save in $1
                    (<(hr)          // start tag = $2
                        \b          // word break
                        ([^<>])*?
                    \/?>)           // the matching end tag
                    [ \t]*
                    (?=\n{2,})      // followed by a blank line
                )
            /g,hashElement);
            */
            text = text.replace(/\n[ ]{0,3}((<(hr)\b([^<>])*?\/?>)[ \t]*(?=\n{2,}))/g, hashElement);

            // Special case for standalone HTML comments:

            /*
            text = text.replace(/
                \n\n                                            // Starting after a blank line
                [ ]{0,3}                                        // attacklab: g_tab_width - 1
                (                                               // save in $1
                    <!
                    (--(?:|(?:[^>-]|-[^>])(?:[^-]|-[^-])*)--)   // see http://www.w3.org/TR/html-markup/syntax.html#comments and http://meta.stackoverflow.com/q/95256
                    >
                    [ \t]*
                    (?=\n{2,})                                  // followed by a blank line
                )
            /g,hashElement);
            */
            text = text.replace(/\n\n[ ]{0,3}(<!(--(?:|(?:[^>-]|-[^>])(?:[^-]|-[^-])*)--)>[ \t]*(?=\n{2,}))/g, hashElement);

            // PHP and ASP-style processor instructions (<?...?> and <%...%>)

            /*
            text = text.replace(/
                (?:
                    \n\n            // Starting after a blank line
                )
                (                   // save in $1
                    [ ]{0,3}        // attacklab: g_tab_width - 1
                    (?:
                        <([?%])     // $2
                        [^\r]*?
                        \2>
                    )
                    [ \t]*
                    (?=\n{2,})      // followed by a blank line
                )
            /g,hashElement);
            */
            text = text.replace(/(?:\n\n)([ ]{0,3}(?:<([?%])[^\r]*?\2>)[ \t]*(?=\n{2,}))/g, hashElement);

            return text;
        }

        function hashElement(wholeMatch, m1) {
            var blockText = m1;

            // Undo double lines
            blockText = blockText.replace(/^\n+/, "");

            // strip trailing blank lines
            blockText = blockText.replace(/\n+$/g, "");

            // Replace the element text with a marker ("~KxK" where x is its key)
            blockText = "\n\n~K" + (g_html_blocks.push(blockText) - 1) + "K\n\n";

            return blockText;
        }
        
        var blockGamutHookCallback = function (t) { return _RunBlockGamut(t); }

        function _RunBlockGamut(text, doNotUnhash) {
            //
            // These are all the transformations that form block-level
            // tags like paragraphs, headers, and list items.
            //
            
            text = pluginHooks.preBlockGamut(text, blockGamutHookCallback);
            
            text = _DoHeaders(text);

            // Do Horizontal Rules:
            var replacement = "<hr />\n";
            text = text.replace(/^[ ]{0,2}([ ]?\*[ ]?){3,}[ \t]*$/gm, replacement);
            text = text.replace(/^[ ]{0,2}([ ]?-[ ]?){3,}[ \t]*$/gm, replacement);
            text = text.replace(/^[ ]{0,2}([ ]?_[ ]?){3,}[ \t]*$/gm, replacement);

            text = _DoLists(text);
            text = _DoCodeBlocks(text);
            text = _DoBlockQuotes(text);
            
            text = pluginHooks.postBlockGamut(text, blockGamutHookCallback);

            // We already ran _HashHTMLBlocks() before, in Markdown(), but that
            // was to escape raw HTML in the original Markdown source. This time,
            // we're escaping the markup we've just created, so that we don't wrap
            // <p> tags around block-level tags.
            text = _HashHTMLBlocks(text);
            text = _FormParagraphs(text, doNotUnhash);

            return text;
        }

        function _RunSpanGamut(text) {
            //
            // These are all the transformations that occur *within* block-level
            // tags like paragraphs, headers, and list items.
            //

            text = pluginHooks.preSpanGamut(text);
            
            text = _DoCodeSpans(text);
            text = _EscapeSpecialCharsWithinTagAttributes(text);
            text = _EncodeBackslashEscapes(text);

            // Process anchor and image tags. Images must come first,
            // because ![foo][f] looks like an anchor.
            text = _DoImages(text);
            text = _DoAnchors(text);

            // Make links out of things like `<http://example.com/>`
            // Must come after _DoAnchors(), because you can use < and >
            // delimiters in inline links like [this](<url>).
            text = _DoAutoLinks(text);
            
            text = text.replace(/~P/g, "://"); // put in place to prevent autolinking; reset now
            
            text = _EncodeAmpsAndAngles(text);
            text = _DoItalicsAndBold(text);

            // Do hard breaks:
            text = text.replace(/  +\n/g, " <br>\n");
            
            text = pluginHooks.postSpanGamut(text);

            return text;
        }

        function _EscapeSpecialCharsWithinTagAttributes(text) {
            //
            // Within tags -- meaning between < and > -- encode [\ ` * _] so they
            // don't conflict with their use in Markdown for code, italics and strong.
            //

            // Build a regex to find HTML tags and comments.  See Friedl's 
            // "Mastering Regular Expressions", 2nd Ed., pp. 200-201.

            // SE: changed the comment part of the regex

            var regex = /(<[a-z\/!$]("[^"]*"|'[^']*'|[^'">])*>|<!(--(?:|(?:[^>-]|-[^>])(?:[^-]|-[^-])*)--)>)/gi;

            text = text.replace(regex, function (wholeMatch) {
                var tag = wholeMatch.replace(/(.)<\/?code>(?=.)/g, "$1`");
                tag = escapeCharacters(tag, wholeMatch.charAt(1) == "!" ? "\\`*_/" : "\\`*_"); // also escape slashes in comments to prevent autolinking there -- http://meta.stackoverflow.com/questions/95987
                return tag;
            });

            return text;
        }

        function _DoAnchors(text) {
            //
            // Turn Markdown link shortcuts into XHTML <a> tags.
            //
            //
            // First, handle reference-style links: [link text] [id]
            //

            /*
            text = text.replace(/
                (                           // wrap whole match in $1
                    \[
                    (
                        (?:
                            \[[^\]]*\]      // allow brackets nested one level
                            |
                            [^\[]           // or anything else
                        )*
                    )
                    \]

                    [ ]?                    // one optional space
                    (?:\n[ ]*)?             // one optional newline followed by spaces

                    \[
                    (.*?)                   // id = $3
                    \]
                )
                ()()()()                    // pad remaining backreferences
            /g, writeAnchorTag);
            */
            text = text.replace(/(\[((?:\[[^\]]*\]|[^\[\]])*)\][ ]?(?:\n[ ]*)?\[(.*?)\])()()()()/g, writeAnchorTag);

            //
            // Next, inline-style links: [link text](url "optional title")
            //

            /*
            text = text.replace(/
                (                           // wrap whole match in $1
                    \[
                    (
                        (?:
                            \[[^\]]*\]      // allow brackets nested one level
                            |
                            [^\[\]]         // or anything else
                        )*
                    )
                    \]
                    \(                      // literal paren
                    [ \t]*
                    ()                      // no id, so leave $3 empty
                    <?(                     // href = $4
                        (?:
                            \([^)]*\)       // allow one level of (correctly nested) parens (think MSDN)
                            |
                            [^()\s]
                        )*?
                    )>?                
                    [ \t]*
                    (                       // $5
                        (['"])              // quote char = $6
                        (.*?)               // Title = $7
                        \6                  // matching quote
                        [ \t]*              // ignore any spaces/tabs between closing quote and )
                    )?                      // title is optional
                    \)
                )
            /g, writeAnchorTag);
            */

            text = text.replace(/(\[((?:\[[^\]]*\]|[^\[\]])*)\]\([ \t]*()<?((?:\([^)]*\)|[^()\s])*?)>?[ \t]*((['"])(.*?)\6[ \t]*)?\))/g, writeAnchorTag);

            //
            // Last, handle reference-style shortcuts: [link text]
            // These must come last in case you've also got [link test][1]
            // or [link test](/foo)
            //

            /*
            text = text.replace(/
                (                   // wrap whole match in $1
                    \[
                    ([^\[\]]+)      // link text = $2; can't contain '[' or ']'
                    \]
                )
                ()()()()()          // pad rest of backreferences
            /g, writeAnchorTag);
            */
            text = text.replace(/(\[([^\[\]]+)\])()()()()()/g, writeAnchorTag);

            return text;
        }

        function writeAnchorTag(wholeMatch, m1, m2, m3, m4, m5, m6, m7) {
            if (m7 == undefined) m7 = "";
            var whole_match = m1;
            var link_text = m2.replace(/:\/\//g, "~P"); // to prevent auto-linking withing the link. will be converted back after the auto-linker runs
            var link_id = m3.toLowerCase();
            var url = m4;
            var title = m7;

            if (url == "") {
                if (link_id == "") {
                    // lower-case and turn embedded newlines into spaces
                    link_id = link_text.toLowerCase().replace(/ ?\n/g, " ");
                }
                url = "#" + link_id;

                if (g_urls.get(link_id) != undefined) {
                    url = g_urls.get(link_id);
                    if (g_titles.get(link_id) != undefined) {
                        title = g_titles.get(link_id);
                    }
                }
                else {
                    if (whole_match.search(/\(\s*\)$/m) > -1) {
                        // Special case for explicit empty url
                        url = "";
                    } else {
                        return whole_match;
                    }
                }
            }
            url = encodeProblemUrlChars(url);
            url = escapeCharacters(url, "*_");
            var result = "<a href=\"" + url + "\"";

            if (title != "") {
                title = attributeEncode(title);
                title = escapeCharacters(title, "*_");
                result += " title=\"" + title + "\"";
            }

            result += ">" + link_text + "</a>";

            return result;
        }

        function _DoImages(text) {
            //
            // Turn Markdown image shortcuts into <img> tags.
            //

            //
            // First, handle reference-style labeled images: ![alt text][id]
            //

            /*
            text = text.replace(/
                (                   // wrap whole match in $1
                    !\[
                    (.*?)           // alt text = $2
                    \]

                    [ ]?            // one optional space
                    (?:\n[ ]*)?     // one optional newline followed by spaces

                    \[
                    (.*?)           // id = $3
                    \]
                )
                ()()()()            // pad rest of backreferences
            /g, writeImageTag);
            */
            text = text.replace(/(!\[(.*?)\][ ]?(?:\n[ ]*)?\[(.*?)\])()()()()/g, writeImageTag);

            //
            // Next, handle inline images:  ![alt text](url "optional title")
            // Don't forget: encode * and _

            /*
            text = text.replace(/
                (                   // wrap whole match in $1
                    !\[
                    (.*?)           // alt text = $2
                    \]
                    \s?             // One optional whitespace character
                    \(              // literal paren
                    [ \t]*
                    ()              // no id, so leave $3 empty
                    <?(\S+?)>?      // src url = $4
                    [ \t]*
                    (               // $5
                        (['"])      // quote char = $6
                        (.*?)       // title = $7
                        \6          // matching quote
                        [ \t]*
                    )?              // title is optional
                    \)
                )
            /g, writeImageTag);
            */
            text = text.replace(/(!\[(.*?)\]\s?\([ \t]*()<?(\S+?)>?[ \t]*((['"])(.*?)\6[ \t]*)?\))/g, writeImageTag);

            return text;
        }
        
        function attributeEncode(text) {
            // unconditionally replace angle brackets here -- what ends up in an attribute (e.g. alt or title)
            // never makes sense to have verbatim HTML in it (and the sanitizer would totally break it)
            return text.replace(/>/g, "&gt;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
        }

        function writeImageTag(wholeMatch, m1, m2, m3, m4, m5, m6, m7) {
            var whole_match = m1;
            var alt_text = m2;
            var link_id = m3.toLowerCase();
            var url = m4;
            var title = m7;

            if (!title) title = "";

            if (url == "") {
                if (link_id == "") {
                    // lower-case and turn embedded newlines into spaces
                    link_id = alt_text.toLowerCase().replace(/ ?\n/g, " ");
                }
                url = "#" + link_id;

                if (g_urls.get(link_id) != undefined) {
                    url = g_urls.get(link_id);
                    if (g_titles.get(link_id) != undefined) {
                        title = g_titles.get(link_id);
                    }
                }
                else {
                    return whole_match;
                }
            }
            
            alt_text = escapeCharacters(attributeEncode(alt_text), "*_[]()");
            url = escapeCharacters(url, "*_");
            var result = "<img src=\"" + url + "\" alt=\"" + alt_text + "\"";

            // attacklab: Markdown.pl adds empty title attributes to images.
            // Replicate this bug.

            //if (title != "") {
            title = attributeEncode(title);
            title = escapeCharacters(title, "*_");
            result += " title=\"" + title + "\"";
            //}

            result += " />";

            return result;
        }

        function _DoHeaders(text) {

            // Setext-style headers:
            //  Header 1
            //  ========
            //  
            //  Header 2
            //  --------
            //
            text = text.replace(/^(.+)[ \t]*\n=+[ \t]*\n+/gm,
                function (wholeMatch, m1) { return "<h1>" + _RunSpanGamut(m1) + "</h1>\n\n"; }
            );

            text = text.replace(/^(.+)[ \t]*\n-+[ \t]*\n+/gm,
                function (matchFound, m1) { return "<h2>" + _RunSpanGamut(m1) + "</h2>\n\n"; }
            );

            // atx-style headers:
            //  # Header 1
            //  ## Header 2
            //  ## Header 2 with closing hashes ##
            //  ...
            //  ###### Header 6
            //

            /*
            text = text.replace(/
                ^(\#{1,6})      // $1 = string of #'s
                [ \t]*
                (.+?)           // $2 = Header text
                [ \t]*
                \#*             // optional closing #'s (not counted)
                \n+
            /gm, function() {...});
            */

            text = text.replace(/^(\#{1,6})[ \t]*(.+?)[ \t]*\#*\n+/gm,
                function (wholeMatch, m1, m2) {
                    var h_level = m1.length;
                    return "<h" + h_level + ">" + _RunSpanGamut(m2) + "</h" + h_level + ">\n\n";
                }
            );

            return text;
        }

        function _DoLists(text, isInsideParagraphlessListItem) {
            //
            // Form HTML ordered (numbered) and unordered (bulleted) lists.
            //

            // attacklab: add sentinel to hack around khtml/safari bug:
            // http://bugs.webkit.org/show_bug.cgi?id=11231
            text += "~0";

            // Re-usable pattern to match any entirel ul or ol list:

            /*
            var whole_list = /
                (                                   // $1 = whole list
                    (                               // $2
                        [ ]{0,3}                    // attacklab: g_tab_width - 1
                        ([*+-]|\d+[.])              // $3 = first list item marker
                        [ \t]+
                    )
                    [^\r]+?
                    (                               // $4
                        ~0                          // sentinel for workaround; should be $
                        |
                        \n{2,}
                        (?=\S)
                        (?!                         // Negative lookahead for another list item marker
                            [ \t]*
                            (?:[*+-]|\d+[.])[ \t]+
                        )
                    )
                )
            /g
            */
            var whole_list = /^(([ ]{0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(~0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/gm;

            if (g_list_level) {
                text = text.replace(whole_list, function (wholeMatch, m1, m2) {
                    var list = m1;
                    var list_type = (m2.search(/[*+-]/g) > -1) ? "ul" : "ol";

                    var result = _ProcessListItems(list, list_type, isInsideParagraphlessListItem);

                    // Trim any trailing whitespace, to put the closing `</$list_type>`
                    // up on the preceding line, to get it past the current stupid
                    // HTML block parser. This is a hack to work around the terrible
                    // hack that is the HTML block parser.
                    result = result.replace(/\s+$/, "");
                    result = "<" + list_type + ">" + result + "</" + list_type + ">\n";
                    return result;
                });
            } else {
                whole_list = /(\n\n|^\n?)(([ ]{0,3}([*+-]|\d+[.])[ \t]+)[^\r]+?(~0|\n{2,}(?=\S)(?![ \t]*(?:[*+-]|\d+[.])[ \t]+)))/g;
                text = text.replace(whole_list, function (wholeMatch, m1, m2, m3) {
                    var runup = m1;
                    var list = m2;

                    var list_type = (m3.search(/[*+-]/g) > -1) ? "ul" : "ol";
                    var result = _ProcessListItems(list, list_type);
                    result = runup + "<" + list_type + ">\n" + result + "</" + list_type + ">\n";
                    return result;
                });
            }

            // attacklab: strip sentinel
            text = text.replace(/~0/, "");

            return text;
        }

        var _listItemMarkers = { ol: "\\d+[.]", ul: "[*+-]" };

        function _ProcessListItems(list_str, list_type, isInsideParagraphlessListItem) {
            //
            //  Process the contents of a single ordered or unordered list, splitting it
            //  into individual list items.
            //
            //  list_type is either "ul" or "ol".

            // The $g_list_level global keeps track of when we're inside a list.
            // Each time we enter a list, we increment it; when we leave a list,
            // we decrement. If it's zero, we're not in a list anymore.
            //
            // We do this because when we're not inside a list, we want to treat
            // something like this:
            //
            //    I recommend upgrading to version
            //    8. Oops, now this line is treated
            //    as a sub-list.
            //
            // As a single paragraph, despite the fact that the second line starts
            // with a digit-period-space sequence.
            //
            // Whereas when we're inside a list (or sub-list), that line will be
            // treated as the start of a sub-list. What a kludge, huh? This is
            // an aspect of Markdown's syntax that's hard to parse perfectly
            // without resorting to mind-reading. Perhaps the solution is to
            // change the syntax rules such that sub-lists must start with a
            // starting cardinal number; e.g. "1." or "a.".

            g_list_level++;

            // trim trailing blank lines:
            list_str = list_str.replace(/\n{2,}$/, "\n");

            // attacklab: add sentinel to emulate \z
            list_str += "~0";

            // In the original attacklab showdown, list_type was not given to this function, and anything
            // that matched /[*+-]|\d+[.]/ would just create the next <li>, causing this mismatch:
            //
            //  Markdown          rendered by WMD        rendered by MarkdownSharp
            //  ------------------------------------------------------------------
            //  1. first          1. first               1. first
            //  2. second         2. second              2. second
            //  - third           3. third                   * third
            //
            // We changed this to behave identical to MarkdownSharp. This is the constructed RegEx,
            // with {MARKER} being one of \d+[.] or [*+-], depending on list_type:
        
            /*
            list_str = list_str.replace(/
                (^[ \t]*)                       // leading whitespace = $1
                ({MARKER}) [ \t]+               // list marker = $2
                ([^\r]+?                        // list item text   = $3
                    (\n+)
                )
                (?=
                    (~0 | \2 ({MARKER}) [ \t]+)
                )
            /gm, function(){...});
            */

            var marker = _listItemMarkers[list_type];
            var re = new RegExp("(^[ \\t]*)(" + marker + ")[ \\t]+([^\\r]+?(\\n+))(?=(~0|\\1(" + marker + ")[ \\t]+))", "gm");
            var last_item_had_a_double_newline = false;
            list_str = list_str.replace(re,
                function (wholeMatch, m1, m2, m3) {
                    var item = m3;
                    var leading_space = m1;
                    var ends_with_double_newline = /\n\n$/.test(item);
                    var contains_double_newline = ends_with_double_newline || item.search(/\n{2,}/) > -1;

                    if (contains_double_newline || last_item_had_a_double_newline) {
                        item = _RunBlockGamut(_Outdent(item), /* doNotUnhash = */true);
                    }
                    else {
                        // Recursion for sub-lists:
                        item = _DoLists(_Outdent(item), /* isInsideParagraphlessListItem= */ true);
                        item = item.replace(/\n$/, ""); // chomp(item)
                        if (!isInsideParagraphlessListItem)
                            item = _RunSpanGamut(item);
                    }
                    last_item_had_a_double_newline = ends_with_double_newline;
                    return "<li>" + item + "</li>\n";
                }
            );

            // attacklab: strip sentinel
            list_str = list_str.replace(/~0/g, "");

            g_list_level--;
            return list_str;
        }

        function _DoCodeBlocks(text) {
            //
            //  Process Markdown `<pre><code>` blocks.
            //  

            /*
            text = text.replace(/
                (?:\n\n|^)
                (                               // $1 = the code block -- one or more lines, starting with a space/tab
                    (?:
                        (?:[ ]{4}|\t)           // Lines must start with a tab or a tab-width of spaces - attacklab: g_tab_width
                        .*\n+
                    )+
                )
                (\n*[ ]{0,3}[^ \t\n]|(?=~0))    // attacklab: g_tab_width
            /g ,function(){...});
            */

            // attacklab: sentinel workarounds for lack of \A and \Z, safari\khtml bug
            text += "~0";

            text = text.replace(/(?:\n\n|^\n?)((?:(?:[ ]{4}|\t).*\n+)+)(\n*[ ]{0,3}[^ \t\n]|(?=~0))/g,
                function (wholeMatch, m1, m2) {
                    var codeblock = m1;
                    var nextChar = m2;

                    codeblock = _EncodeCode(_Outdent(codeblock));
                    codeblock = _Detab(codeblock);
                    codeblock = codeblock.replace(/^\n+/g, ""); // trim leading newlines
                    codeblock = codeblock.replace(/\n+$/g, ""); // trim trailing whitespace

                    codeblock = "<pre><code>" + codeblock + "\n</code></pre>";

                    return "\n\n" + codeblock + "\n\n" + nextChar;
                }
            );

            // attacklab: strip sentinel
            text = text.replace(/~0/, "");

            return text;
        }

        function hashBlock(text) {
            text = text.replace(/(^\n+|\n+$)/g, "");
            return "\n\n~K" + (g_html_blocks.push(text) - 1) + "K\n\n";
        }

        function _DoCodeSpans(text) {
            //
            // * Backtick quotes are used for <code></code> spans.
            // 
            // * You can use multiple backticks as the delimiters if you want to
            //   include literal backticks in the code span. So, this input:
            //     
            //      Just type ``foo `bar` baz`` at the prompt.
            //     
            //   Will translate to:
            //     
            //      <p>Just type <code>foo `bar` baz</code> at the prompt.</p>
            //     
            //   There's no arbitrary limit to the number of backticks you
            //   can use as delimters. If you need three consecutive backticks
            //   in your code, use four for delimiters, etc.
            //
            // * You can use spaces to get literal backticks at the edges:
            //     
            //      ... type `` `bar` `` ...
            //     
            //   Turns to:
            //     
            //      ... type <code>`bar`</code> ...
            //

            /*
            text = text.replace(/
                (^|[^\\])       // Character before opening ` can't be a backslash
                (`+)            // $2 = Opening run of `
                (               // $3 = The code block
                    [^\r]*?
                    [^`]        // attacklab: work around lack of lookbehind
                )
                \2              // Matching closer
                (?!`)
            /gm, function(){...});
            */

            text = text.replace(/(^|[^\\])(`+)([^\r]*?[^`])\2(?!`)/gm,
                function (wholeMatch, m1, m2, m3, m4) {
                    var c = m3;
                    c = c.replace(/^([ \t]*)/g, ""); // leading whitespace
                    c = c.replace(/[ \t]*$/g, ""); // trailing whitespace
                    c = _EncodeCode(c);
                    c = c.replace(/:\/\//g, "~P"); // to prevent auto-linking. Not necessary in code *blocks*, but in code spans. Will be converted back after the auto-linker runs.
                    return m1 + "<code>" + c + "</code>";
                }
            );

            return text;
        }

        function _EncodeCode(text) {
            //
            // Encode/escape certain characters inside Markdown code runs.
            // The point is that in code, these characters are literals,
            // and lose their special Markdown meanings.
            //
            // Encode all ampersands; HTML entities are not
            // entities within a Markdown code span.
            text = text.replace(/&/g, "&amp;");

            // Do the angle bracket song and dance:
            text = text.replace(/</g, "&lt;");
            text = text.replace(/>/g, "&gt;");

            // Now, escape characters that are magic in Markdown:
            text = escapeCharacters(text, "\*_{}[]\\", false);

            // jj the line above breaks this:
            //---

            //* Item

            //   1. Subitem

            //            special char: *
            //---

            return text;
        }

        function _DoItalicsAndBold(text) {

            // <strong> must go first:
            text = text.replace(/([\W_]|^)(\*\*|__)(?=\S)([^\r]*?\S[\*_]*)\2([\W_]|$)/g,
            "$1<strong>$3</strong>$4");

            text = text.replace(/([\W_]|^)(\*|_)(?=\S)([^\r\*_]*?\S)\2([\W_]|$)/g,
            "$1<em>$3</em>$4");

            return text;
        }

        function _DoBlockQuotes(text) {

            /*
            text = text.replace(/
                (                           // Wrap whole match in $1
                    (
                        ^[ \t]*>[ \t]?      // '>' at the start of a line
                        .+\n                // rest of the first line
                        (.+\n)*             // subsequent consecutive lines
                        \n*                 // blanks
                    )+
                )
            /gm, function(){...});
            */

            text = text.replace(/((^[ \t]*>[ \t]?.+\n(.+\n)*\n*)+)/gm,
                function (wholeMatch, m1) {
                    var bq = m1;

                    // attacklab: hack around Konqueror 3.5.4 bug:
                    // "----------bug".replace(/^-/g,"") == "bug"

                    bq = bq.replace(/^[ \t]*>[ \t]?/gm, "~0"); // trim one level of quoting

                    // attacklab: clean up hack
                    bq = bq.replace(/~0/g, "");

                    bq = bq.replace(/^[ \t]+$/gm, "");     // trim whitespace-only lines
                    bq = _RunBlockGamut(bq);             // recurse

                    bq = bq.replace(/(^|\n)/g, "$1  ");
                    // These leading spaces screw with <pre> content, so we need to fix that:
                    bq = bq.replace(
                            /(\s*<pre>[^\r]+?<\/pre>)/gm,
                        function (wholeMatch, m1) {
                            var pre = m1;
                            // attacklab: hack around Konqueror 3.5.4 bug:
                            pre = pre.replace(/^  /mg, "~0");
                            pre = pre.replace(/~0/g, "");
                            return pre;
                        });

                    return hashBlock("<blockquote>\n" + bq + "\n</blockquote>");
                }
            );
            return text;
        }

        function _FormParagraphs(text, doNotUnhash) {
            //
            //  Params:
            //    $text - string to process with html <p> tags
            //

            // Strip leading and trailing lines:
            text = text.replace(/^\n+/g, "");
            text = text.replace(/\n+$/g, "");

            var grafs = text.split(/\n{2,}/g);
            var grafsOut = [];
            
            var markerRe = /~K(\d+)K/;

            //
            // Wrap <p> tags.
            //
            var end = grafs.length;
            for (var i = 0; i < end; i++) {
                var str = grafs[i];

                // if this is an HTML marker, copy it
                if (markerRe.test(str)) {
                    grafsOut.push(str);
                }
                else if (/\S/.test(str)) {
                    str = _RunSpanGamut(str);
                    str = str.replace(/^([ \t]*)/g, "<p>");
                    str += "</p>"
                    grafsOut.push(str);
                }

            }
            //
            // Unhashify HTML blocks
            //
            if (!doNotUnhash) {
                end = grafsOut.length;
                for (var i = 0; i < end; i++) {
                    var foundAny = true;
                    while (foundAny) { // we may need several runs, since the data may be nested
                        foundAny = false;
                        grafsOut[i] = grafsOut[i].replace(/~K(\d+)K/g, function (wholeMatch, id) {
                            foundAny = true;
                            return g_html_blocks[id];
                        });
                    }
                }
            }
            return grafsOut.join("\n\n");
        }

        function _EncodeAmpsAndAngles(text) {
            // Smart processing for ampersands and angle brackets that need to be encoded.

            // Ampersand-encoding based entirely on Nat Irons's Amputator MT plugin:
            //   http://bumppo.net/projects/amputator/
            text = text.replace(/&(?!#?[xX]?(?:[0-9a-fA-F]+|\w+);)/g, "&amp;");

            // Encode naked <'s
            text = text.replace(/<(?![a-z\/?!]|~D)/gi, "&lt;");

            return text;
        }

        function _EncodeBackslashEscapes(text) {
            //
            //   Parameter:  String.
            //   Returns:    The string, with after processing the following backslash
            //               escape sequences.
            //

            // attacklab: The polite way to do this is with the new
            // escapeCharacters() function:
            //
            //     text = escapeCharacters(text,"\\",true);
            //     text = escapeCharacters(text,"`*_{}[]()>#+-.!",true);
            //
            // ...but we're sidestepping its use of the (slow) RegExp constructor
            // as an optimization for Firefox.  This function gets called a LOT.

            text = text.replace(/\\(\\)/g, escapeCharacters_callback);
            text = text.replace(/\\([`*_{}\[\]()>#+-.!])/g, escapeCharacters_callback);
            return text;
        }
        
        function handleTrailingParens(wholeMatch, lookbehind, protocol, link) {
            if (lookbehind)
                return wholeMatch;
            if (link.charAt(link.length - 1) !== ")")
                return "<" + protocol + link + ">";
            var parens = link.match(/[()]/g);
            var level = 0;
            for (var i = 0; i < parens.length; i++) {
                if (parens[i] === "(") {
                    if (level <= 0)
                        level = 1;
                    else
                        level++;
                }
                else {
                    level--;
                }
            }
            var tail = "";
            if (level < 0) {
                var re = new RegExp("\\){1," + (-level) + "}$");
                link = link.replace(re, function (trailingParens) {
                    tail = trailingParens;
                    return "";
                });
            }
            
            return "<" + protocol + link + ">" + tail;
        }

        function _DoAutoLinks(text) {

            // note that at this point, all other URL in the text are already hyperlinked as <a href=""></a>
            // *except* for the <http://www.foo.com> case

            // automatically add < and > around unadorned raw hyperlinks
            // must be preceded by a non-word character (and not by =" or <) and followed by non-word/EOF character
            // simulating the lookbehind in a consuming way is okay here, since a URL can neither and with a " nor
            // with a <, so there is no risk of overlapping matches.
            text = text.replace(/(="|<)?\b(https?|ftp)(:\/\/[-A-Z0-9+&@#\/%?=~_|\[\]\(\)!:,\.;]*[-A-Z0-9+&@#\/%=~_|\[\])])(?=$|\W)/gi, handleTrailingParens);

            //  autolink anything like <http://example.com>
            
            var replacer = function (wholematch, m1) { return "<a href=\"" + m1 + "\">" + pluginHooks.plainLinkText(m1) + "</a>"; }
            text = text.replace(/<((https?|ftp):[^'">\s]+)>/gi, replacer);

            // Email addresses: <address@domain.foo>
            /*
            text = text.replace(/
                <
                (?:mailto:)?
                (
                    [-.\w]+
                    \@
                    [-a-z0-9]+(\.[-a-z0-9]+)*\.[a-z]+
                )
                >
            /gi, _DoAutoLinks_callback());
            */

            /* disabling email autolinking, since we don't do that on the server, either
            text = text.replace(/<(?:mailto:)?([-.\w]+\@[-a-z0-9]+(\.[-a-z0-9]+)*\.[a-z]+)>/gi,
                function(wholeMatch,m1) {
                    return _EncodeEmailAddress( _UnescapeSpecialChars(m1) );
                }
            );
            */
            return text;
        }

        function _UnescapeSpecialChars(text) {
            //
            // Swap back in all the special characters we've hidden.
            //
            text = text.replace(/~E(\d+)E/g,
                function (wholeMatch, m1) {
                    var charCodeToReplace = parseInt(m1);
                    return String.fromCharCode(charCodeToReplace);
                }
            );
            return text;
        }

        function _Outdent(text) {
            //
            // Remove one level of line-leading tabs or spaces
            //

            // attacklab: hack around Konqueror 3.5.4 bug:
            // "----------bug".replace(/^-/g,"") == "bug"

            text = text.replace(/^(\t|[ ]{1,4})/gm, "~0"); // attacklab: g_tab_width

            // attacklab: clean up hack
            text = text.replace(/~0/g, "")

            return text;
        }

        function _Detab(text) {
            if (!/\t/.test(text))
                return text;

            var spaces = ["    ", "   ", "  ", " "],
            skew = 0,
            v;

            return text.replace(/[\n\t]/g, function (match, offset) {
                if (match === "\n") {
                    skew = offset + 1;
                    return match;
                }
                v = (offset - skew) % 4;
                skew = offset + 1;
                return spaces[v];
            });
        }

        //
        //  attacklab: Utility functions
        //

        var _problemUrlChars = /(?:["'*()[\]:]|~D)/g;

        // hex-encodes some unusual "problem" chars in URLs to avoid URL detection problems 
        function encodeProblemUrlChars(url) {
            if (!url)
                return "";

            var len = url.length;

            return url.replace(_problemUrlChars, function (match, offset) {
                if (match == "~D") // escape for dollar
                    return "%24";
                if (match == ":") {
                    if (offset == len - 1 || /[0-9\/]/.test(url.charAt(offset + 1)))
                        return ":"
                }
                return "%" + match.charCodeAt(0).toString(16);
            });
        }


        function escapeCharacters(text, charsToEscape, afterBackslash) {
            // First we have to escape the escape characters so that
            // we can build a character class out of them
            var regexString = "([" + charsToEscape.replace(/([\[\]\\])/g, "\\$1") + "])";

            if (afterBackslash) {
                regexString = "\\\\" + regexString;
            }

            var regex = new RegExp(regexString, "g");
            text = text.replace(regex, escapeCharacters_callback);

            return text;
        }


        function escapeCharacters_callback(wholeMatch, m1) {
            var charCodeToEscape = m1.charCodeAt(0);
            return "~E" + charCodeToEscape + "E";
        }

    }; // end of the Markdown.Converter constructor

})();
;/*!
file: Markdown.Extra.js
Licence

Javascript Markdown Extra Extensions for Pagedown
Copyright © 2012-2013 Justin McManus
All rights reserved.

PHP Markdown & Extra
Copyright © 2004-2013 Michel Fortin
All rights reserved.

Original Markdown
Copyright © 2004-2006 John Gruber
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

Neither the name “PHP Markdown” nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

This software is provided by the copyright holders and contributors “as is” and any express or implied warranties, including, but not limited to, the implied warranties of merchantability and fitness for a particular purpose are disclaimed. In no event shall the copyright owner or contributors be liable for any direct, indirect, incidental, special, exemplary, or consequential damages (including, but not limited to, procurement of substitute goods or services; loss of use, data, or profits; or business interruption) however caused and on any theory of liability, whether in contract, strict liability, or tort (including negligence or otherwise) arising in any way out of the use of this software, even if advised of the possibility of such damage.
*/
//https://github.com/jmcmanus/pagedown-extra
(function () {
    // A quick way to make sure we're only keeping span-level tags when we need to.
    // This isn't supposed to be foolproof. It's just a quick way to make sure we
    // keep all span-level tags returned by a pagedown converter. It should allow
    // all span-level tags through, with or without attributes.
    var inlineTags = new RegExp(['^(<\\/?(a|abbr|acronym|applet|area|b|basefont|',
        'bdo|big|button|cite|code|del|dfn|em|figcaption|',
        'font|i|iframe|img|input|ins|kbd|label|map|',
        'mark|meter|object|param|progress|q|ruby|rp|rt|s|',
        'samp|script|select|small|span|strike|strong|',
        'sub|sup|textarea|time|tt|u|var|wbr)[^>]*>|',
        '<(br)\\s?\\/?>)$'].join(''), 'i');

    /******************************************************************
     * Utility Functions                                              *
     *****************************************************************/

    // patch for ie7
    if (!Array.indexOf) {
        Array.prototype.indexOf = function(obj) {
            for (var i = 0; i < this.length; i++) {
                if (this[i] == obj) {
                    return i;
                }
            }
            return -1;
        };
    }

    function trim(str) {
        return str.replace(/^\s+|\s+$/g, '');
    }

    function rtrim(str) {
        return str.replace(/\s+$/g, '');
    }

    // Remove one level of indentation from text. Indent is 4 spaces.
    function outdent(text) {
        return text.replace(new RegExp('^(\\t|[ ]{1,4})', 'gm'), '');
    }

    function contains(str, substr) {
        return str.indexOf(substr) != -1;
    }

    // Sanitize html, removing tags that aren't in the whitelist
    function sanitizeHtml(html, whitelist) {
        return html.replace(/<[^>]*>?/gi, function(tag) {
            return tag.match(whitelist) ? tag : '';
        });
    }

    // Merge two arrays, keeping only unique elements.
    function union(x, y) {
        var obj = {};
        for (var i = 0; i < x.length; i++)
            obj[x[i]] = x[i];
        for (i = 0; i < y.length; i++)
            obj[y[i]] = y[i];
        var res = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k))
                res.push(obj[k]);
        }
        return res;
    }

    // JS regexes don't support \A or \Z, so we add sentinels, as Pagedown
    // does. In this case, we add the ascii codes for start of text (STX) and
    // end of text (ETX), an idea borrowed from:
    // https://github.com/tanakahisateru/js-markdown-extra
    function addAnchors(text) {
        if(text.charAt(0) != '\x02')
            text = '\x02' + text;
        if(text.charAt(text.length - 1) != '\x03')
            text = text + '\x03';
        return text;
    }

    // Remove STX and ETX sentinels.
    function removeAnchors(text) {
        if(text.charAt(0) == '\x02')
            text = text.substr(1);
        if(text.charAt(text.length - 1) == '\x03')
            text = text.substr(0, text.length - 1);
        return text;
    }

    // Convert markdown within an element, retaining only span-level tags
    function convertSpans(text, extra) {
        return sanitizeHtml(convertAll(text, extra), inlineTags);
    }

    // Convert internal markdown using the stock pagedown converter
    function convertAll(text, extra) {
        var result = extra.blockGamutHookCallback(text);
        // We need to perform these operations since we skip the steps in the converter
        result = unescapeSpecialChars(result);
        result = result.replace(/~D/g, "$$").replace(/~T/g, "~");
        result = extra.previousPostConversion(result);
        return result;
    }

    // Convert escaped special characters to HTML decimal entity codes.
    function processEscapes(text) {
        // Markdown extra adds two escapable characters, `:` and `|`
        // If escaped, we convert them to html entities so our
        // regexes don't recognize them. Markdown doesn't support escaping
        // the escape character, e.g. `\\`, which make this even simpler.
        return text.replace(/\\\|/g, '&#124;').replace(/\\:/g, '&#58;');
    }

    // Duplicated from PageDown converter
    function unescapeSpecialChars(text) {
        // Swap back in all the special characters we've hidden.
        text = text.replace(/~E(\d+)E/g, function(wholeMatch, m1) {
            var charCodeToReplace = parseInt(m1);
            return String.fromCharCode(charCodeToReplace);
        });
        return text;
    }

    /*****************************************************************************
     * Markdown.Extra *
     ****************************************************************************/

    Markdown.Extra = function() {
        // For converting internal markdown (in tables for instance).
        // This is necessary since these methods are meant to be called as
        // preConversion hooks, and the Markdown converter passed to init()
        // won't convert any markdown contained in the html tags we return.
        this.converter = null;

        // Stores html blocks we generate in hooks so that
        // they're not destroyed if the user is using a sanitizing converter
        this.hashBlocks = [];

        // Special attribute blocks for fenced code blocks and headers enabled.
        this.attributeBlocks = false;

        // Fenced code block options
        this.googleCodePrettify = false;
        this.highlightJs = false;

        // Table options
        this.tableClass = '';

        this.tabWidth = 4;
    };

    Markdown.Extra.init = function(converter, options) {
        // Each call to init creates a new instance of Markdown.Extra so it's
        // safe to have multiple converters, with different options, on a single page
        var extra = new Markdown.Extra();
        var postNormalizationTransformations = [];
        var preBlockGamutTransformations = [];
        var postConversionTransformations = ["unHashExtraBlocks"];

        options = options || {};
        options.extensions = options.extensions || ["all"];
        if (contains(options.extensions, "all")) {
            options.extensions = ["tables", "fenced_code_gfm", "def_list", "attr_list"];
        }
        if (contains(options.extensions, "attr_list")) {
            postNormalizationTransformations.push("hashFcbAttributeBlocks");
            preBlockGamutTransformations.push("hashHeaderAttributeBlocks");
            postConversionTransformations.push("applyAttributeBlocks");
            extra.attributeBlocks = true;
        }
        if (contains(options.extensions, "tables")) {
            preBlockGamutTransformations.push("tables");
        }
        if (contains(options.extensions, "fenced_code_gfm")) {
            postNormalizationTransformations.push("fencedCodeBlocks");
        }
        if (contains(options.extensions, "def_list")) {
            preBlockGamutTransformations.push("definitionLists");
        }

        converter.hooks.chain("postNormalization", function(text) {
            return extra.doTransform(postNormalizationTransformations, text) + '\n';
        });

        converter.hooks.chain("preBlockGamut", function(text, blockGamutHookCallback) {
            // Keep a reference to the block gamut callback to run recursively
            extra.blockGamutHookCallback = blockGamutHookCallback;
            text = processEscapes(text);
            return extra.doTransform(preBlockGamutTransformations, text) + '\n';
        });

        // Keep a reference to the hook chain running before doPostConversion to apply on hashed extra blocks
        extra.previousPostConversion = converter.hooks.postConversion;
        converter.hooks.chain("postConversion", function(text) {
            text = extra.doTransform(postConversionTransformations, text);
            // Clear state vars that may use unnecessary memory
            this.hashBlocks = [];
            return text;
        });

        if ("highlighter" in options) {
            extra.googleCodePrettify = options.highlighter === 'prettify';
            extra.highlightJs = options.highlighter === 'highlight';
        }

        if ("table_class" in options) {
            extra.tableClass = options.table_class;
        }

        extra.converter = converter;

        // Caller usually won't need this, but it's handy for testing.
        return extra;
    };

    // Do transformations
    Markdown.Extra.prototype.doTransform = function(transformations, text) {
        for(var i = 0; i < transformations.length; i++)
            text = this[transformations[i]](text);
        return text;
    };

    // Return a placeholder containing a key, which is the block's index in the
    // hashBlocks array. We wrap our output in a <p> tag here so Pagedown won't.
    Markdown.Extra.prototype.hashExtraBlock = function(block) {
        return '\n<p>~X' + (this.hashBlocks.push(block) - 1) + 'X</p>\n';
    };

    // Replace placeholder blocks in `text` with their corresponding
    // html blocks in the hashBlocks array.
    Markdown.Extra.prototype.unHashExtraBlocks = function(text) {
        var self = this;
        function recursiveUnHash() {
            var hasHash = false;
            text = text.replace(/<p>~X(\d+)X<\/p>/g, function(wholeMatch, m1) {
                hasHash = true;
                var key = parseInt(m1, 10);
                return self.hashBlocks[key];
            });
            if(hasHash === true) {
                recursiveUnHash();
            }
        }
        recursiveUnHash();
        return text;
    };


    /******************************************************************
     * Attribute Blocks                                               *
     *****************************************************************/

        // Extract headers attribute blocks, move them above the element they will be
        // applied to, and hash them for later.
    Markdown.Extra.prototype.hashHeaderAttributeBlocks = function(text) {
        // TODO: use sentinels. Should we just add/remove them in doConversion?
        // TODO: better matches for id / class attributes
        var attrBlock = "\\{\\s*[.|#][^}]+\\}";
        var hdrAttributesA = new RegExp("^(#{1,6}.*#{0,6})\\s+(" + attrBlock + ")[ \\t]*(\\n|0x03)", "gm");
        var hdrAttributesB = new RegExp("^(.*)\\s+(" + attrBlock + ")[ \\t]*\\n" +
            "(?=[\\-|=]+\\s*(\\n|0x03))", "gm"); // underline lookahead

        var self = this;
        function attributeCallback(wholeMatch, pre, attr) {
            return '<p>~XX' + (self.hashBlocks.push(attr) - 1) + 'XX</p>\n' + pre + "\n";
        }

        text = text.replace(hdrAttributesA, attributeCallback);  // ## headers
        text = text.replace(hdrAttributesB, attributeCallback);  // underline headers
        return text;
    };

    // Extract FCB attribute blocks, move them above the element they will be
    // applied to, and hash them for later.
    Markdown.Extra.prototype.hashFcbAttributeBlocks = function(text) {
        // TODO: use sentinels. Should we just add/remove them in doConversion?
        // TODO: better matches for id / class attributes
        var attrBlock = "\\{\\s*[.|#][^}]+\\}";
        var fcbAttributes =  new RegExp("^(```[^{]*)\\s+(" + attrBlock + ")[ \\t]*\\n" +
            "(?=([\\s\\S]*?)\\n```\\s*(\\n|0x03))", "gm");

        var self = this;
        function attributeCallback(wholeMatch, pre, attr) {
            return '<p>~XX' + (self.hashBlocks.push(attr) - 1) + 'XX</p>\n' + pre + "\n";
        }

        return text.replace(fcbAttributes, attributeCallback);
    };

    Markdown.Extra.prototype.applyAttributeBlocks = function(text) {
        var self = this;
        var blockRe = new RegExp('<p>~XX(\\d+)XX</p>[\\s]*' +
            '(?:<(h[1-6]|pre)(?: +class="(\\S+)")?(>[\\s\\S]*?</\\2>))', "gm");
        text = text.replace(blockRe, function(wholeMatch, k, tag, cls, rest) {
            if (!tag) // no following header or fenced code block.
                return '';

            // get attributes list from hash
            var key = parseInt(k, 10);
            var attributes = self.hashBlocks[key];

            // get id
            var id = attributes.match(/#[^\s{}]+/g) || [];
            var idStr = id[0] ? ' id="' + id[0].substr(1, id[0].length - 1) + '"' : '';

            // get classes and merge with existing classes
            var classes = attributes.match(/\.[^\s{}]+/g) || [];
            for (var i = 0; i < classes.length; i++) // Remove leading dot
                classes[i] = classes[i].substr(1, classes[i].length - 1);

            var classStr = '';
            if (cls)
                classes = union(classes, [cls]);

            if (classes.length > 0)
                classStr = ' class="' + classes.join(' ') + '"';

            return "<" + tag + idStr + classStr + rest;
        });

        return text;
    };

    /******************************************************************
     * Tables                                                         *
     *****************************************************************/

        // Find and convert Markdown Extra tables into html.
    Markdown.Extra.prototype.tables = function(text) {
        var self = this;

        var leadingPipe = new RegExp(
            ['^'                         ,
                '[ ]{0,3}'                  , // Allowed whitespace
                '[|]'                       , // Initial pipe
                '(.+)\\n'                   , // $1: Header Row

                '[ ]{0,3}'                  , // Allowed whitespace
                '[|]([ ]*[-:]+[-| :]*)\\n'  , // $2: Separator

                '('                         , // $3: Table Body
                '(?:[ ]*[|].*\\n?)*'      , // Table rows
                ')',
                '(?:\\n|$)'                   // Stop at final newline
            ].join(''),
            'gm'
        );

        var noLeadingPipe = new RegExp(
            ['^'                         ,
                '[ ]{0,3}'                  , // Allowed whitespace
                '(\\S.*[|].*)\\n'           , // $1: Header Row

                '[ ]{0,3}'                  , // Allowed whitespace
                '([-:]+[ ]*[|][-| :]*)\\n'  , // $2: Separator

                '('                         , // $3: Table Body
                '(?:.*[|].*\\n?)*'        , // Table rows
                ')'                         ,
                '(?:\\n|$)'                   // Stop at final newline
            ].join(''),
            'gm'
        );

        text = text.replace(leadingPipe, doTable);
        text = text.replace(noLeadingPipe, doTable);

        // $1 = header, $2 = separator, $3 = body
        function doTable(match, header, separator, body, offset, string) {
            // remove any leading pipes and whitespace
            header = header.replace(/^ *[|]/m, '');
            separator = separator.replace(/^ *[|]/m, '');
            body = body.replace(/^ *[|]/gm, '');

            // remove trailing pipes and whitespace
            header = header.replace(/[|] *$/m, '');
            separator = separator.replace(/[|] *$/m, '');
            body = body.replace(/[|] *$/gm, '');

            // determine column alignments
            alignspecs = separator.split(/ *[|] */);
            align = [];
            for (var i = 0; i < alignspecs.length; i++) {
                var spec = alignspecs[i];
                if (spec.match(/^ *-+: *$/m))
                    align[i] = ' style="text-align:right;"';
                else if (spec.match(/^ *:-+: *$/m))
                    align[i] = ' style="text-align:center;"';
                else if (spec.match(/^ *:-+ *$/m))
                    align[i] = ' style="text-align:left;"';
                else align[i] = '';
            }

            // TODO: parse spans in header and rows before splitting, so that pipes
            // inside of tags are not interpreted as separators
            var headers = header.split(/ *[|] */);
            var colCount = headers.length;

            // build html
            var cls = self.tableClass ? ' class="' + self.tableClass + '"' : '';
            var html = ['<table', cls, '>\n', '<thead>\n', '<tr>\n'].join('');

            // build column headers.
            for (i = 0; i < colCount; i++) {
                var headerHtml = convertSpans(trim(headers[i]), self);
                html += ["  <th", align[i], ">", headerHtml, "</th>\n"].join('');
            }
            html += "</tr>\n</thead>\n";

            // build rows
            var rows = body.split('\n');
            for (i = 0; i < rows.length; i++) {
                if (rows[i].match(/^\s*$/)) // can apply to final row
                    continue;

                // ensure number of rowCells matches colCount
                var rowCells = rows[i].split(/ *[|] */);
                var lenDiff = colCount - rowCells.length;
                for (var j = 0; j < lenDiff; j++)
                    rowCells.push('');

                html += "<tr>\n";
                for (j = 0; j < colCount; j++) {
                    var colHtml = convertSpans(trim(rowCells[j]), self);
                    html += ["  <td", align[j], ">", colHtml, "</td>\n"].join('');
                }
                html += "</tr>\n";
            }

            html += "</table>\n";

            // replace html with placeholder until postConversion step
            return self.hashExtraBlock(html);
        }

        return text;
    };


    /******************************************************************
     * Fenced Code Blocks  (gfm)                                       *
     ******************************************************************/

        // Find and convert gfm-inspired fenced code blocks into html.
    Markdown.Extra.prototype.fencedCodeBlocks = function(text) {
        function encodeCode(code) {
            code = code.replace(/&/g, "&amp;");
            code = code.replace(/</g, "&lt;");
            code = code.replace(/>/g, "&gt;");
            // These were escaped by PageDown before postNormalization
            code = code.replace(/~D/g, "$$");
            code = code.replace(/~T/g, "~");
            return code;
        }

        var self = this;
        text = text.replace(/(?:^|\n)```(.*)\n([\s\S]*?)\n```/g, function(match, m1, m2) {
            var language = m1, codeblock = m2;

            // adhere to specified options
            var preclass = self.googleCodePrettify ? ' class="prettyprint"' : '';
            var codeclass = '';
            if (language) {
                if (self.googleCodePrettify || self.highlightJs) {
                    // use html5 language- class names. supported by both prettify and highlight.js
                    codeclass = ' class="language-' + language + '"';
                } else {
                    codeclass = ' class="' + language + '"';
                }
            }

            var html = ['<pre', preclass, '><code', codeclass, '>',
                encodeCode(codeblock), '</code></pre>'].join('');

            // replace codeblock with placeholder until postConversion step
            return self.hashExtraBlock(html);
        });

        return text;
    };


    /******************************************************************
     * Definition Lists                                                *
     ******************************************************************/

        // Find and convert markdown extra definition lists into html.
    Markdown.Extra.prototype.definitionLists = function(text) {
        var wholeList = new RegExp(
            ['(\\x02\\n?|\\n\\n)'          ,
                '(?:'                         ,
                '('                         , // $1 = whole list
                '('                       , // $2
                '[ ]{0,3}'              ,
                '((?:[ \\t]*\\S.*\\n)+)', // $3 = defined term
                '\\n?'                  ,
                '[ ]{0,3}:[ ]+'         , // colon starting definition
                ')'                       ,
                '([\\s\\S]+?)'            ,
                '('                       , // $4
                '(?=\\0x03)'          , // \z
                '|'                     ,
                '(?='                 ,
                '\\n{2,}'           ,
                '(?=\\S)'           ,
                '(?!'               , // Negative lookahead for another term
                '[ ]{0,3}'        ,
                '(?:\\S.*\\n)+?'  , // defined term
                '\\n?'            ,
                '[ ]{0,3}:[ ]+'   , // colon starting definition
                ')'                 ,
                '(?!'               , // Negative lookahead for another definition
                '[ ]{0,3}:[ ]+'   , // colon starting definition
                ')'                 ,
                ')'                   ,
                ')'                       ,
                ')'                         ,
                ')'
            ].join(''),
            'gm'
        );

        var self = this;
        text = addAnchors(text);

        text = text.replace(wholeList, function(match, pre, list) {
            var result = trim(self.processDefListItems(list));
            result = "<dl>\n" + result + "\n</dl>";
            return pre + self.hashExtraBlock(result) + "\n\n";
        });

        return removeAnchors(text);
    };

    // Process the contents of a single definition list, splitting it
    // into individual term and definition list items.
    Markdown.Extra.prototype.processDefListItems = function(listStr) {
        var self = this;

        var dt = new RegExp(
            ['(\\x02\\n?|\\n\\n+)'    , // leading line
                '('                      , // definition terms = $1
                '[ ]{0,3}'             , // leading whitespace
                '(?![:][ ]|[ ])'       , // negative lookahead for a definition
                //   mark (colon) or more whitespace
                '(?:\\S.*\\n)+?'       , // actual term (not whitespace)
                ')'                      ,
                '(?=\\n?[ ]{0,3}:[ ])'     // lookahead for following line feed
            ].join(''),                 //   with a definition mark
            'gm'
        );

        var dd = new RegExp(
            ['\\n(\\n+)?'              , // leading line = $1
                '('                       , // marker space = $2
                '[ ]{0,3}'              , // whitespace before colon
                '[:][ ]+'               , // definition mark (colon)
                ')'                       ,
                '([\\s\\S]+?)'            , // definition text = $3
                '(?=\\n*'                 , // stop at next definition mark,
                '(?:'                   , // next term or end of text
                '\\n[ ]{0,3}[:][ ]|'  ,
                '<dt>|\\x03'          , // \z
                ')'                     ,
                ')'
            ].join(''),
            'gm'
        );

        listStr = addAnchors(listStr);
        // trim trailing blank lines:
        listStr = listStr.replace(/\n{2,}(?=\\x03)/, "\n");

        // Process definition terms.
        listStr = listStr.replace(dt, function(match, pre, termsStr) {
            var terms = trim(termsStr).split("\n");
            var text = '';
            for (var i = 0; i < terms.length; i++) {
                var term = terms[i];
                // process spans inside dt
                term = convertSpans(trim(term), self);
                text += "\n<dt>" + term + "</dt>";
            }
            return text + "\n";
        });

        // Process actual definitions.
        listStr = listStr.replace(dd, function(match, leadingLine, markerSpace, def) {
            if (leadingLine || def.match(/\n{2,}/)) {
                // replace marker with the appropriate whitespace indentation
                def = Array(markerSpace.length + 1).join(' ') + def;
                // process markdown inside definition
                // TODO?: currently doesn't apply extensions
                def = outdent(def) + "\n\n";
                def = "\n" + convertAll(def, self) + "\n";
            } else {
                // convert span-level markdown inside definition
                def = rtrim(def);
                def = convertSpans(outdent(def), self);
            }

            return "\n<dd>" + def + "</dd>\n";
        });

        return removeAnchors(listStr);
    };

})();
;/*!
file: Markdown.Sanitizer.js

Licence same as Markdown.Converter.js
*/
//https://code.google.com/p/pagedown/

//two patched by rodyhhaddad:
//  added h4,h5,h6 to `basic_tag_whitelist`
//  allowed for a link to start by `#`
//  allowed `class` attributes on `span` and `i`
(function () {
    var output, Converter;
    if (typeof exports === "object" && typeof require === "function") { // we're in a CommonJS (e.g. Node.js) module
        output = exports;
        Converter = require("./Markdown.Converter").Converter;
    } else {
        output = window.Markdown;
        Converter = output.Converter;
    }
        
    output.getSanitizingConverter = function () {
        var converter = new Converter();
        converter.hooks.chain("postConversion", sanitizeHtml);
        converter.hooks.chain("postConversion", balanceTags);
        return converter;
    }

    function sanitizeHtml(html) {
        return html.replace(/<[^>]*>?/gi, sanitizeTag);
    }

    // (tags that can be opened/closed) | (tags that stand alone)
    var basic_tag_whitelist = /^(<\/?(b|blockquote|code|del|dd|dl|dt|em|h1|h2|h3|h4|h5|h6|i|kbd|li|ol|p|pre|s|sup|sub|strong|strike|ul|span)>|<(br|hr)\s?\/?>)$/i;
    // <a href="url..." optional title>|</a>
    var a_white = /^(<a\shref="(((https?|ftp):\/\/|\/)|#)[-A-Za-z0-9+&@#\/%?=~_|!:,.;\(\)]+"(\stitle="[^"<>]+")?\s?>|<\/a>)$/i;

    // <img src="url..." optional width  optional height  optional alt  optional title
    var img_white = /^(<img\ssrc="(https?:\/\/|\/)[-A-Za-z0-9+&@#\/%?=~_|!:,.;\(\)]+"(\swidth="\d{1,3}")?(\sheight="\d{1,3}")?(\salt="[^"<>]*")?(\stitle="[^"<>]*")?\s?\/?>)$/i;

    //<span class="test-ing works"></span> or <i>
    var span_icon_white = /^(<(span|i)\sclass="([-A-Za-z ]+)")\s?(>(.*)|()<\/(span|i)>)$/i;


    function sanitizeTag(tag) {
        if (tag.match(basic_tag_whitelist) || tag.match(a_white) || tag.match(img_white) || tag.match(span_icon_white))
            return tag;
        else
            return "";
    }

    /// <summary>
    /// attempt to balance HTML tags in the html string
    /// by removing any unmatched opening or closing tags
    /// IMPORTANT: we *assume* HTML has *already* been 
    /// sanitized and is safe/sane before balancing!
    /// 
    /// adapted from CODESNIPPET: A8591DBA-D1D3-11DE-947C-BA5556D89593
    /// </summary>
    function balanceTags(html) {

        if (html == "")
            return "";

        var re = /<\/?\w+[^>]*(\s|$|>)/g;
        // convert everything to lower case; this makes
        // our case insensitive comparisons easier
        var tags = html.toLowerCase().match(re);

        // no HTML tags present? nothing to do; exit now
        var tagcount = (tags || []).length;
        if (tagcount == 0)
            return html;

        var tagname, tag;
        var ignoredtags = "<p><img><br><li><hr>";
        var match;
        var tagpaired = [];
        var tagremove = [];
        var needsRemoval = false;

        // loop through matched tags in forward order
        for (var ctag = 0; ctag < tagcount; ctag++) {
            tagname = tags[ctag].replace(/<\/?(\w+).*/, "$1");
            // skip any already paired tags
            // and skip tags in our ignore list; assume they're self-closed
            if (tagpaired[ctag] || ignoredtags.search("<" + tagname + ">") > -1)
                continue;

            tag = tags[ctag];
            match = -1;

            if (!/^<\//.test(tag)) {
                // this is an opening tag
                // search forwards (next tags), look for closing tags
                for (var ntag = ctag + 1; ntag < tagcount; ntag++) {
                    if (!tagpaired[ntag] && tags[ntag] == "</" + tagname + ">") {
                        match = ntag;
                        break;
                    }
                }
            }

            if (match == -1)
                needsRemoval = tagremove[ctag] = true; // mark for removal
            else
                tagpaired[match] = true; // mark paired
        }

        if (!needsRemoval)
            return html;

        // delete all orphaned tags from the string

        var ctag = 0;
        html = html.replace(re, function (match) {
            var res = tagremove[ctag] ? "" : match;
            ctag++;
            return res;
        });
        return html;
    }
})();
;/*!
 file: mentDoc.js
 */
var mentDoc = (function () {
    var mentDoc,
        regDirectives = {}, //registered directives
        DOM_ELEMENT = 1; // nodeType

    function Command(el, parent) {
        this.el = el;
        this.parent = parent || null;
        this.attrs = {};
        this.children = [];
        this.data = parent ? makeInherit(parent.data) : {};

        this.el.style.textDecoration = "none";

        this.refreshAttrs();
        this.updateChildren();
    }

    Command.isCommandEl = function (el) {
        return (el.nodeType === DOM_ELEMENT &&
            ( el.nodeName === "U" || el.getAttribute("you") !== null )
            );
    };

    Command.prototype = {
        constructor: Command,

        isRoot: false,
        refreshAttrs: function () {
            this.attrs = {};

            forEach(this.el.attributes, function (attr) {
                if (attr.specified) {
                    var name = attr.name,
                        value = this.el.getAttribute(name, 3), // 3: IE, case-sens. and String
                        normAttr = mentDoc.normalizeAttr(name);

                    this.attrs[normAttr] = value;

                    if (regDirectives[normAttr] && isFn(regDirectives[normAttr].encounter)) {
                        regDirectives[normAttr].encounter(this.el, value, this);
                    }
                }
            }, this);

            return this;
        },

        updateChildren: function () {
            this.children = [];
            this._loopThroughEl(this.el.childNodes);

            return this;
        },
        _loopThroughEl: function (childNodes) {
            forEach(childNodes, function (el) {
                if (Command.isCommandEl(el)) {
                    this.children.push(
                        new Command(el, this)
                    );
                } else if (el.nodeType === DOM_ELEMENT) {
                    this._loopThroughEl(el.childNodes);
                }
            }, this);

            return this;
        },

        execute: function () {
            forEach(this._sortedDirectives(), function (commandName) {
                if (isFn(regDirectives[commandName].execute)) {
                    regDirectives[commandName].execute(this.el, this.attrs[commandName], this);
                }
            }, this);

            this.executeChildren();

            return this;
        },
        executeChildren: function () {
            forEach(this.children, function (child) {
                child.execute();
            });

            return this;
        },

        _sortedDirectives: function () {
            var directives = [];
            forEach(this.attrs, function (value, name) {
                if (regDirectives[name]) {
                    directives.push(name);
                }
            }, this);

            return directives.sort(function (a, b) {
                return regDirectives[a].priority - regDirectives[b].priority;
            });
        }
    };

    mentDoc = {
        Command: Command,

        compile: function (html) {
            var elRoot;

            elRoot = document.createElement("u");
            elRoot.innerHTML = html;

            var root = new Command(elRoot);
            root.isRoot = true;

            return root;
        },

        priorityAlias: {
            "high": 10,
            "medium": 20,
            "low": 30,
            "default": 30
        },
        regDirectives: regDirectives,
        addDirective: function (name, info) {
            if (typeof info === "function") {
                info = {execute: info};
            }

            if (!info.priority) {
                info.priority = this.priorityAlias["default"];
            } else if (typeof info.priority === "string") {
                info.priority = this.priorityAlias[info.priority];
            }

            if (isNaN(info.priority)) {
                throw "Unknown priority given for directive `" + name + "` : " + info.priority;
            }

            regDirectives[name] = info;
        },

        //taken from angularjs
        //convert `data-a-b` and `x-a-b` and `a-b` to aB
        normalizeAttr: (function () {
            var PREFIX_REGEXP = /^(x[\:\-_]|data[\:\-_])/i;
            var SPECIAL_CHARS_REGEXP = /([\:\-\_]+(.))/g;
            var MOZ_HACK_REGEXP = /^moz([A-Z])/;

            function upperCaseLetter(_, separator, letter, offset) {
                return offset ? letter.toUpperCase() : letter;
            }

            function camelCase(name) {
                return name
                    .replace(SPECIAL_CHARS_REGEXP, upperCaseLetter)
                    .replace(MOZ_HACK_REGEXP, 'Moz$1')
                    ;
            }

            return function (name) {
                return camelCase(name.replace(PREFIX_REGEXP, ''));
            };

        }()),

        forEach: forEach,
        isArray: isArray,
        isObject: isObject,
        isFn: isFn,
        makeInherit: makeInherit
    };

    //obj can be an Object/Array/Function
    function forEach(obj, iterator, context) {
        var key;
        if (obj && iterator) {
            context = context || obj;
            if (isFn(obj)) {
                for (key in obj) {
                    if (key != "prototype" && key != "length" &&
                        key != "name" && obj.hasOwnProperty(key)) {
                        iterator.call(context, obj[key], key);
                    }
                }
            } else if (obj.forEach && obj.forEach !== forEach) {
                obj.forEach(iterator, context);
            } else if (isArray(obj) || obj.hasOwnProperty("length")) {
                for (key = 0; key < obj.length; key++)
                    iterator.call(context, obj[key], key);
            } else {
                for (key in obj) {
                    if (obj.hasOwnProperty(key)) {
                        iterator.call(context, obj[key], key);
                    }
                }
            }
        }
        return obj;
    }

    function isArray(obj) {
        return Object.prototype.toString.call(obj) === "[object Array]";
    }

    function isObject(obj) {
        return typeof obj === "object" && obj !== null;
    }

    function isFn(fn) {
        return typeof fn === "function";
    }

    function makeInherit(obj) {
        if (Object.create) {
            return Object.create(obj);
        } else {
            var o = function () {
            };
            o.prototype = obj;
            return new o();
        }
    }

    return mentDoc;
}());

mentDoc.addDirective("inEl", function (el, value, command) {
    command.data.inEl = value;
});

mentDoc.addDirective("appendTo", function (el, value, command) {
    $(value, command.data.inEl).append(el.innerHTML);
});

mentDoc.addDirective("empty", {
    priority: "medium",
    execute: function (el, value, command) {
        $(value, command.data.inEl).empty();
    }
});

mentDoc.addDirective("remove", function (el, value, command) {
    $(value, command.data.inEl).remove();
});


mentDoc.markdown = {
    convertHtml: function (markdown) {
        var converter = Markdown.getSanitizingConverter(),
            lines = markdown.split(/\n/g),
            foundIndentLength = null;

        for (var i = 0; i < lines.length; i++) {
            if (foundIndentLength === null) {
                var matches = lines[i].match(/^(\s*)\S.*/);
                if (matches) {
                    foundIndentLength = matches[1].length;
                }
            }
            if (foundIndentLength !== null) {
                //remove indentation
                lines[i] = lines[i].substring(foundIndentLength);
            }
        }
        markdown = lines.join("\n");

        Markdown.Extra.init(converter, {extensions: "all", highlighter: "prettify"});
        return converter.makeHtml(markdown);
    }
};

mentDoc.addDirective("markdown", {
    priority: "high",
    encounter: function (el) {
        el.innerHTML = mentDoc.markdown.convertHtml(
            el.innerHTML
        );
    }
});

if (typeof module !== "undefined" && module.exports) {
    module.exports.mentDoc = mentDoc;
}