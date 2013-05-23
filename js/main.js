$(".markdown").each(function() {
    var content = $(this).html(),
        html = mentDoc.markdown.convertHtml(content);
    
    // This is a total hack, I know
    // markdown="" is ugly to show, but that's what `.innerHTML` returns
    // so I'm fixing it
    html = html.replace(/ markdown=""/, " markdown");
    
    $(this).empty().html(html);
});

$(".mentDoc").each(function() {
    mentDoc.compile(this.innerHTML).execute();
});