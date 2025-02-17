---
layout: page
permalink: /repositories/
title: GitHub
description: Find me on GitHub @sohaamir 🖥️
nav: true
nav_order: 3
---

## GitHub Profile & Statistics

{% if site.data.repositories.github_users %}
<!-- GitHub Profile Stats -->
<div class="repositories d-flex flex-wrap flex-md-row flex-column justify-content-between align-items-center">
  {% for user in site.data.repositories.github_users %}
    {% include repository/repo_user.html username=user %}
  {% endfor %}
</div>

<!-- Additional Stats -->
<div class="stats-container">
  {% for user in site.data.repositories.github_users %}
    <!-- Language Stats -->
    <div class="repo p-2 text-center">
      <a href="https://github.com/{{ user }}">
        <img class="repo-img-light w-100" alt="{{ user }}'s Top Languages" 
             src="https://github-readme-stats.vercel.app/api/top-langs/?username={{ user }}&layout=compact&theme={{ site.repo_theme_light }}&hide_border=true">
        <img class="repo-img-dark w-100" alt="{{ user }}'s Top Languages" 
             src="https://github-readme-stats.vercel.app/api/top-langs/?username={{ user }}&layout=compact&theme={{ site.repo_theme_dark }}&hide_border=true">
      </a>
    </div>

    <!-- Streak Stats -->
    <div class="repo p-2 text-center">
      <a href="https://github.com/{{ user }}">
        <img class="repo-img-light w-100" alt="{{ user }}'s Streak" 
             src="https://github-readme-streak-stats.herokuapp.com/?user={{ user }}&theme={{ site.repo_theme_light }}&hide_border=true">
        <img class="repo-img-dark w-100" alt="{{ user }}'s Streak" 
             src="https://github-readme-streak-stats.herokuapp.com/?user={{ user }}&theme={{ site.repo_theme_dark }}&hide_border=true">
      </a>
    </div>

    <!-- Contribution Graph -->
    <div class="repo p-2 text-center">
      <a href="https://github.com/{{ user }}">
        <img class="repo-img-light w-100" alt="{{ user }}'s Activity Graph" 
             src="https://github-readme-activity-graph.vercel.app/graph?username={{ user }}&theme=minimal&hide_border=true">
        <img class="repo-img-dark w-100" alt="{{ user }}'s Activity Graph" 
             src="https://github-readme-activity-graph.vercel.app/graph?username={{ user }}&theme=github-dark&hide_border=true">
      </a>
    </div>
  {% endfor %}
</div>

{% if site.repo_trophies.enabled %}
<!-- GitHub Trophies -->
<div class="repositories d-flex flex-wrap flex-md-row flex-column justify-content-between align-items-center">
  {% for user in site.data.repositories.github_users %}
    {% include repository/repo_trophies.html username=user %}
  {% endfor %}
</div>
{% endif %}
{% endif %}

## Featured Repositories

{% if site.data.repositories.github_repos %}
<div class="repositories d-flex flex-wrap flex-md-row flex-column justify-content-between align-items-center">
  {% for repo in site.data.repositories.github_repos %}
    {% include repository/repo.html repository=repo %}
  {% endfor %}
</div>
{% endif %}

<style>
.stats-container {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  margin: 2rem 0;
}

.stats-container .repo {
  flex: 1;
  min-width: 300px;
  max-width: 450px;
}

.repositories {
  margin: 20px 0;
}

.repo {
  transition: transform 0.2s;
}

.repo:hover {
  transform: translateY(-4px);
}
</style>