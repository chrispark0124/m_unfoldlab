package com.example.myapplication

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.example.myapplication.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // 최초 화면: 홈
        if (savedInstanceState == null) {
            switchFragment(HomeFragment())
        }

        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> switchFragment(HomeFragment())
                R.id.nav_cases -> switchFragment(CasesFragment())
                R.id.nav_expert -> switchFragment(ExpertFragment())
                R.id.nav_community -> switchFragment(CommunityFragment())
                R.id.nav_menu -> switchFragment(MenuFragment())
                else -> false
            }
        }
    }

    private fun switchFragment(fragment: Fragment): Boolean {
        supportFragmentManager
            .beginTransaction()
            .replace(R.id.fragment_container, fragment)
            .commit()
        return true
    }
}

