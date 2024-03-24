# `Aamir Sohail's` personal website 🌐

![GitHub release (latest SemVer)](https://img.shields.io/github/v/release/alshedivat/al-folio)
![GitHub](https://img.shields.io/github/license/alshedivat/al-folio?color=blue)
[![Hosted with GH Pages](https://img.shields.io/badge/Hosted_with-GitHub_Pages-blue?logo=github&logoColor=white)](https://pages.github.com/ "Go to GitHub Pages homepage")
![maintained - yes](https://img.shields.io/badge/maintained-yes-blue)

This is the repository for my personal website, using the al-folio theme. For instructions on how to add some of the specific customizations I have made to my website including: 
- GIFs
- Changing your profile picture
- Adding a form which notifies you of submissions by email
- Changing your website favicon
  
.. among many others, please have a read of my blog post: [Setting up an academic website - a guide for absolute beginners](https://sohaamir.github.io/blog/2023/setting_up_website/). Whilst the guide was written for my older website, the same code can still be used.

## A brief note on deployment

1. Open and run the Docker container (via Docker destop) for the website
2. Navigate in your terminal to the master branch of the website (e.g., /Users/aamirsohail/Documents/GitHub/sohaamir.github.io)
3. Run `docker compose up` which will open the website at `http://localhost:8080/`
4. Make changes to whatever file(s) you want
5. Have a look at your changes by refreshing the browser
6. If you are happy, commit the changes by running the following commands:

```bash
git status # this is to check that your changes are waiting to be commited
git add . 
git commit -m 'insert text about changes here'
git push origin
```
7. This should automatically deploy your website on GitHub!

## Adding a gallery

The major difference between my website and others is the addition of a 'gallery'. To do so I did the following:

1. Added this code to the `_base.scss` file which controls the properties of the images including size and location within the page: 

```css
/* Gallery Styles */
.gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  justify-content: center;
}

.gallery-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer; /* Indicates that the item is interactive */
}

.gallery img {
  width: 80%;
  height: auto;
  transition: transform 0.3s ease; /* Smooth transition for scaling */
  display: block;
}

.gallery img:hover {
  transform: scale(1.6); /* Enlarge the image on hover */
}

.gallery-caption {
  text-align: center;
  margin-top: 8px;
  font-size: 1.2em; /* Adjust this value to make the caption larger */
}

.gallery-intro {
  margin-bottom: 20px; /* Add space between the intro and the gallery */

  h1 {
    font-size: 2em; /* Large font for the main heading */
    text-align: center; /* Center the heading if you like */
    margin-bottom: 0.5em;
  }

  p {
    font-size: 1em; /* Adjust this as needed */
    text-align: center; /* Center the paragraph if you like */
    margin-top: 0.25em; /* Reduce the top margin */
    margin-bottom: 0.25em; /* Reduce the bottom margin */
  }
}
```
2. Added this code to the `gallery.html` file, which controls the layout of the page:

```html
<div class="gallery-intro">
  <h1><b>My Scientific Journey</b></h1>
  <p>A collection of pictures reflecting my journey in science and the wonderful people who I met along the way.</p>
  <p>Or a timeline of male-pattern baldness.</p>
  <p>However which way you want to look at it.</p>
  <br>
  <p>Some of the earlier photos aren't in great quality, that's because we didn't actually</p>
  <p>have mobile phones with HD cameras back then. I know, it's hard to believe.</p>
</div>

<div class="gallery">
    {% for entry in page.gallery_images %}
        <div class="gallery-item">
            <img src="{{ site.baseurl }}/assets/img/gallery/{{ entry.image }}" alt="{{ entry.caption | markdownify | strip_html }}">
            <div class="gallery-caption">
                {{ entry.caption | markdownify }}
            </div>
        </div>
    {% endfor %}
</div>
```

3. You can then just add your images (so long as they are within the `/assets/img` folder, to the `gallery.md` file: 

```markdown
gallery_images:
  - image: chemistry.png
    caption: "As a (relatively) young upstart in my Sixth Form chemistry class. At the back as usual"
  - image: imperial_dinner.png
    caption: "First year at Imperial (just off camera)"
  - image: imperial_house.png
    caption: "Completely oblivious to the fact that I am blocking Rohan out of the group photo at Kaiji's"
```

## License

The al-folio theme is available as open source under the terms of the [MIT License](https://github.com/alshedivat/al-folio/blob/master/LICENSE). Originally, **al-folio** was based on the [\*folio theme](https://github.com/bogoli/-folio) (published by [Lia Bogoev](https://liabogoev.com) and under the MIT license).

## Badges

GitHub badges for this page were made using Michael Currin's [Badge Generator](https://michaelcurrin.github.io/badge-generator/#/).
